import "reflect-metadata";
import { randomBytes, randomUUID } from "node:crypto";
import type { NestExpressApplication } from "@nestjs/platform-express";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { z } from "zod";
import {
  DeviceNotMeResultSchema,
  OrderPageSchema,
  ProblemDetailsSchema,
  StaffActionResultSchema,
  StaffPageSchema,
  SupportAccountSchema,
} from "@kemdia/contracts";
import { AppModule } from "../src/app.module.js";
import { loadConfig } from "../src/config/env.js";
import { PrismaService } from "../src/database/prisma.service.js";
import { configureApp } from "../src/http/configure-app.js";
import {
  OTP_SENDER,
  PASSWORD_HASHER,
  type OtpMessage,
  type OtpSender,
  type PasswordHasher,
} from "../src/modules/identity/application/ports.js";
import { SessionService } from "../src/modules/identity/index.js";
import { Account } from "../src/modules/identity/domain/account.js";
import { requireIdentifier } from "../src/modules/identity/domain/identifier.js";
import { PrismaAccountRepository } from "../src/modules/identity/infrastructure/prisma-account.repository.js";
import { testDatabaseUrl } from "./integration-db.js";
import { confirmSecondFactor } from "./second-factor-helper.js";

/**
 * Rôles détaillés de l'équipe, écran Utilisateurs, service client et avis de nouvel appareil (S7.5-T04, ADR-0051), sur
 * une VRAIE base, par HTTP.
 */
const INTERNAL_KEY = randomBytes(32).toString("base64url");
const PASSWORD = "Mangue-Papaye-2026!";
const SITE = "https://kemdia.example";

const matches = <T>(schema: z.ZodType<T>, body: unknown): T => {
  const result = schema.safeParse(body);
  if (!result.success) throw new Error(z.prettifyError(result.error));
  return result.data;
};
const codeOf = (body: unknown) => matches(ProblemDetailsSchema, body).code;

type Role = "ADMIN" | "CATALOG" | "LOGISTICS" | "FINANCE" | "SUPPORT" | "VENDOR";
type Member = { token: string; id: string; email: string };

/** Envoi capturé : les avis partent en arrière-plan, on les lit ici. */
class CapturingSender implements OtpSender {
  readonly channels = ["email", "sms"] as const;
  readonly sent: OtpMessage[] = [];
  send(message: OtpMessage): Promise<void> {
    this.sent.push(message);
    return Promise.resolve();
  }
}

describe("Équipe, utilisateurs, service client et appareils (PostgreSQL, HTTP)", () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;
  let hasher: PasswordHasher;
  const sender = new CapturingSender();
  let admin: Member;

  const call = (method: "get" | "post" | "put" | "delete", url: string, token?: string) => {
    const req = request(app.getHttpServer())
      [method](url)
      .set("X-Kemdia-Internal-Key", INTERNAL_KEY);
    return token ? req.set("Authorization", `Bearer ${token}`) : req;
  };

  async function member(...roles: Role[]): Promise<Member> {
    const email = `equipe.${randomUUID()}@exemple.ga`;
    const now = new Date();
    const account = Account.register({
      id: randomUUID(),
      firstName: "Awa",
      lastName: "Ndong",
      identifier: requireIdentifier(email),
      passwordHash: await hasher.hash(PASSWORD),
      now,
    });
    account.markVerified(requireIdentifier(email), now);
    await new PrismaAccountRepository(prisma).save(account);
    for (const role of roles) {
      await prisma.accountRole.create({ data: { accountId: account.id, role } });
    }
    const opened = await app.get(SessionService).open(account);
    if (roles.some((r) => r !== "VENDOR")) await confirmSecondFactor(prisma, account.id);
    return { token: opened.token, id: account.id, email };
  }

  const login = (
    email: string,
    device?: string,
    userAgent = "Mozilla/5.0 (Linux; Android 14) Chrome/130.0",
  ) =>
    call("post", "/api/v1/auth/login")
      .set("X-Kemdia-User-Agent", userAgent)
      .send({ identifier: email, password: PASSWORD, ...(device ? { device } : {}) });

  const audit = (targetId: string, action: string) =>
    prisma.auditEvent.findMany({ where: { targetId, action }, orderBy: { occurredAt: "asc" } });

  beforeAll(async () => {
    const config = loadConfig({
      NODE_ENV: "test",
      LOG_LEVEL: "silent",
      DATABASE_URL: testDatabaseUrl(),
      API_INTERNAL_KEY: INTERNAL_KEY,
      PUBLIC_SITE_URL: `${SITE}/`,
    });
    const moduleRef = await Test.createTestingModule({ imports: [AppModule.register(config)] })
      .overrideProvider(OTP_SENDER)
      .useValue(sender)
      .compile();
    app = moduleRef.createNestApplication<NestExpressApplication>({ logger: false });
    configureApp(app, config);
    await app.init();
    prisma = app.get(PrismaService);
    hasher = app.get<PasswordHasher>(PASSWORD_HASHER);
  });

  beforeEach(async () => {
    admin = await member("ADMIN");
  });

  afterAll(async () => {
    await app.close();
  });

  it("rôles détaillés : chacun n'ouvre que ses routes ; l'administrateur les ouvre toutes", async () => {
    const [catalog, logistics, finance, support] = [
      await member("CATALOG"),
      await member("LOGISTICS"),
      await member("FINANCE"),
      await member("SUPPORT"),
    ];
    const routes: [string, Member[]][] = [
      ["/api/v1/moderation/products", [catalog, admin]],
      ["/api/v1/admin/shops", [catalog, admin]],
      ["/api/v1/admin/shipping/tariffs", [logistics, admin]],
      ["/api/v1/admin/refunds", [finance, admin]],
      ["/api/v1/admin/coupons", [finance, admin]],
      [`/api/v1/support/accounts/${catalog.id}/orders`, [support, admin]],
      ["/api/v1/admin/staff", [admin]],
    ];
    for (const [url, allowed] of routes) {
      for (const who of [catalog, logistics, finance, support, admin]) {
        const res = await call("get", url, who.token);
        expect([url, res.status]).toEqual([url, allowed.includes(who) ? 200 : 403]);
      }
    }
    // Un administrateur accorde les nouveaux rôles ; jamais « admin »
    const awa = await member();
    for (const role of ["logistics", "finance", "support", "catalog"]) {
      await call("put", `/api/v1/admin/accounts/${awa.id}/roles/${role}`, admin.token).expect(200);
    }
    await call("put", `/api/v1/admin/accounts/${awa.id}/roles/admin`, admin.token).expect(400);
    // Double authentification exigée pour tout rôle de l'équipe (ici : jamais confirmée)
    const fresh = await member();
    await prisma.accountRole.create({ data: { accountId: fresh.id, role: "SUPPORT" } });
    expect(
      codeOf(
        (await call("get", `/api/v1/support/accounts/${fresh.id}/orders`, fresh.token).expect(403))
          .body,
      ),
    ).toBe("DEUX_FACTEURS_A_ACTIVER");
  });

  it("écran Utilisateurs : l'équipe, ses rôles et sa double authentification ; pages par nom", async () => {
    const support = await member("SUPPORT");
    const vendorOnly = await member("VENDOR");
    const page = matches(
      StaffPageSchema,
      (await call("get", "/api/v1/admin/staff?role=support&limit=100", admin.token).expect(200))
        .body,
    );
    const row = page.items.find((m) => m.id === support.id);
    expect(row).toMatchObject({
      roles: ["client", "support"],
      status: "active",
      secondFactorEnabled: false,
    });
    expect(page.items.map((m) => m.id)).not.toContain(vendorOnly.id);
    // Pagination : deux pages d'un membre couvrent les deux premiers, sans doublon
    const first = matches(
      StaffPageSchema,
      (await call("get", "/api/v1/admin/staff?limit=1", admin.token).expect(200)).body,
    );
    const second = matches(
      StaffPageSchema,
      (
        await call(
          "get",
          `/api/v1/admin/staff?limit=1&after=${first.nextCursor}`,
          admin.token,
        ).expect(200)
      ).body,
    );
    expect(second.items[0]?.id).not.toBe(first.items[0]?.id);
    await call("get", "/api/v1/admin/staff?after=pas-une-position-valide", admin.token).expect(400);
  });

  it("départ d'un employé : rôles de l'équipe retirés, vendeur gardé, sessions fermées tout de suite ; tracé", async () => {
    const leaving = await member("CATALOG", "FINANCE", "VENDOR");
    await call("get", "/api/v1/moderation/products", leaving.token).expect(200);
    const result = matches(
      StaffActionResultSchema,
      (
        await call("post", `/api/v1/admin/accounts/${leaving.id}/remove-staff`, admin.token).expect(
          200,
        )
      ).body,
    );
    expect(result.account.roles).toEqual(["client", "vendor"]);
    expect(result.sessionsClosed).toBe(1);
    // Session fermée : plus rien, même pas « Mon compte »
    expect(
      codeOf((await call("get", "/api/v1/auth/session", leaving.token).expect(401)).body),
    ).toBe("SESSION_INVALIDE");
    const [line] = await audit(leaving.id, "staff.removed");
    expect(line?.details).toEqual({ roles: "catalog,finance", sessions: 1 });
    // Il se reconnecte comme client et vendeur seulement
    const back = await login(leaving.email).expect(200);
    await call("get", "/api/v1/moderation/products", back.body.token).expect(403);
  });

  it("désactivation : plus de connexion, sessions fermées, motif au journal ; réactivation", async () => {
    const target = await member("LOGISTICS");
    const url = `/api/v1/admin/accounts/${target.id}`;
    expect(
      codeOf(
        (await call("post", `${url}/disable`, admin.token).send({ reason: "non" }).expect(422))
          .body,
      ),
    ).toBe("MOTIF_INVALIDE");
    const done = matches(
      StaffActionResultSchema,
      (
        await call("post", `${url}/disable`, admin.token)
          .send({ reason: "  Fin de contrat   le 20 octobre  " })
          .expect(200)
      ).body,
    );
    expect(done).toMatchObject({ account: { status: "disabled" }, sessionsClosed: 1 });
    await call("get", "/api/v1/auth/session", target.token).expect(401);
    expect(codeOf((await login(target.email).expect(403)).body)).toBe("COMPTE_DESACTIVE");
    expect((await audit(target.id, "account.disabled"))[0]?.details).toEqual({
      reason: "Fin de contrat le 20 octobre",
      sessions: 1,
    });
    // Déjà désactivé : refus clair
    expect(
      codeOf(
        (
          await call("post", `${url}/disable`, admin.token)
            .send({ reason: "Encore une fois" })
            .expect(409)
        ).body,
      ),
    ).toBe("COMPTE_INACTIF");

    const enabled = matches(
      StaffActionResultSchema,
      (await call("post", `${url}/enable`, admin.token).expect(200)).body,
    );
    expect(enabled.account).toMatchObject({ status: "active", roles: ["client", "logistics"] });
    await login(target.email).expect(200);
    expect(await audit(target.id, "account.enabled")).toHaveLength(1);
    await call("post", `${url}/enable`, admin.token).expect(409);
  });

  it("jamais sur soi-même, jamais sur un administrateur, jamais un compte effacé ; réservé à l'administration", async () => {
    const other = await member("ADMIN");
    for (const action of ["remove-staff", "disable", "enable"]) {
      const body = action === "disable" ? { reason: "Motif suffisant" } : {};
      expect(
        codeOf(
          (
            await call(
              "post",
              `/api/v1/admin/accounts/${admin.id.toUpperCase()}/${action}`,
              admin.token,
            )
              .send(body)
              .expect(403)
          ).body,
        ),
      ).toBe("ROLE_SUR_SOI_INTERDIT");
      expect(
        codeOf(
          (
            await call("post", `/api/v1/admin/accounts/${other.id}/${action}`, admin.token)
              .send(body)
              .expect(403)
          ).body,
        ),
      ).toBe("COMPTE_PROTEGE");
    }
    const gone = await member();
    await prisma.account.update({
      where: { id: gone.id },
      data: { status: "DISABLED", deletedAt: new Date(), email: null, phone: null },
    });
    expect(
      codeOf(
        (await call("post", `/api/v1/admin/accounts/${gone.id}/enable`, admin.token).expect(404))
          .body,
      ),
    ).toBe("COMPTE_INTROUVABLE");
    const catalog = await member("CATALOG");
    await call("post", `/api/v1/admin/accounts/${gone.id}/remove-staff`, catalog.token).expect(403);
  });

  it("service client : compte retrouvé (tracé), commandes en lecture seule", async () => {
    const support = await member("SUPPORT");
    const client = await member();
    const found = matches(
      SupportAccountSchema,
      (
        await call("post", "/api/v1/support/accounts/lookup", support.token)
          .send({ identifier: client.email })
          .expect(200)
      ).body,
    );
    expect(found).toMatchObject({
      id: client.id,
      status: "active",
      emailVerified: true,
      phoneVerified: false,
    });
    const [viewed] = await audit(client.id, "support.account_viewed");
    expect(viewed?.actorId).toBe(support.id);
    const orders = matches(
      OrderPageSchema,
      (await call("get", `/api/v1/support/accounts/${client.id}/orders`, support.token).expect(200))
        .body,
    );
    expect(orders.items).toEqual([]);
    await call(
      "get",
      `/api/v1/support/accounts/${client.id}/orders/KD-20261020-ABCDE`,
      support.token,
    ).expect((res) => expect([400, 404]).toContain(res.status));
    await call("post", "/api/v1/support/accounts/lookup", support.token)
      .send({ identifier: "personne@exemple.ga" })
      .expect(404);
    // Le catalogue ne voit pas les clients
    const catalog = await member("CATALOG");
    await call("post", "/api/v1/support/accounts/lookup", catalog.token)
      .send({ identifier: client.email })
      .expect(403);
  });

  it("nouvel appareil : premier retenu sans avis, inconnu → avis avec lien ; « ce n'est pas moi » ferme tout", async () => {
    const owner = await member();
    const phone = randomBytes(32).toString("base64url");
    const thief = randomBytes(32).toString("base64url");
    const alerts = () =>
      sender.sent.filter(
        (m): m is Extract<OtpMessage, { kind: "new-device" }> =>
          m.kind === "new-device" && m.to === owner.email,
      );

    await login(owner.email, phone).expect(200);
    await login(owner.email, phone).expect(200);
    // Sans identifiant d'appareil (appel direct) : rien à reconnaître
    await login(owner.email).expect(200);
    expect(alerts()).toHaveLength(0);

    const stolen = await login(
      owner.email,
      thief,
      "Mozilla/5.0 (Windows NT 10.0) <script>Firefox/131.0",
    ).expect(200);
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(alerts()).toHaveLength(1);
    const alert = alerts()[0]!;
    // Description choisie dans des listes fixes : rien du navigateur n'est recopié
    expect(alert.device).toBe("Firefox sur Windows");
    expect(alert.link).toMatch(new RegExp(`^${SITE}/securite/pas-moi\\?jeton=[A-Za-z0-9_-]{43}$`));
    expect((await audit(owner.id, "device.new_login"))[0]?.details).toEqual({
      device: "Firefox sur Windows",
    });
    // La base ne garde que des empreintes
    const rows = await prisma.knownDevice.findMany({ where: { accountId: owner.id } });
    expect(rows).toHaveLength(2);
    for (const row of rows) expect(row.deviceHash).not.toContain(phone);

    // Même appareil : plus d'avis
    await login(owner.email, thief).expect(200);
    expect(alerts()).toHaveLength(1);

    const token = new URL(alert.link!).searchParams.get("jeton")!;
    const closed = matches(
      DeviceNotMeResultSchema,
      (await call("post", "/api/v1/auth/devices/not-me").send({ token }).expect(200)).body,
    );
    expect(closed.sessionsClosed).toBeGreaterThanOrEqual(5);
    await call("get", "/api/v1/auth/session", stolen.body.token).expect(401);
    expect(await audit(owner.id, "device.not_me")).toHaveLength(1);
    // Usage unique ; jeton inventé refusé pareil
    expect(
      codeOf((await call("post", "/api/v1/auth/devices/not-me").send({ token }).expect(410)).body),
    ).toBe("ALERTE_INVALIDE");
    await call("post", "/api/v1/auth/devices/not-me")
      .send({ token: randomBytes(32).toString("base64url") })
      .expect(410);
    // L'appareil signalé est oublié : une nouvelle connexion depuis lui redonne un avis
    await login(owner.email, thief).expect(200);
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(alerts()).toHaveLength(2);
  });

  it("lien « ce n'est pas moi » expiré après 7 jours ; base : empreintes seulement", async () => {
    const owner = await member();
    await login(owner.email, randomBytes(32).toString("base64url")).expect(200);
    await login(owner.email, randomBytes(32).toString("base64url")).expect(200);
    await new Promise((resolve) => setTimeout(resolve, 50));
    const alert = sender.sent.findLast(
      (m): m is Extract<OtpMessage, { kind: "new-device" }> =>
        m.kind === "new-device" && m.to === owner.email,
    )!;
    await prisma.knownDevice.updateMany({
      where: { accountId: owner.id, alertExpiresAt: { not: null } },
      data: { alertExpiresAt: new Date(Date.now() - 1000) },
    });
    const token = new URL(alert.link!).searchParams.get("jeton")!;
    await call("post", "/api/v1/auth/devices/not-me").send({ token }).expect(410);
    await expect(
      prisma.$executeRaw`UPDATE "identity"."known_devices" SET "device_hash" = 'pas-une-empreinte' WHERE "account_id" = ${owner.id}::uuid`,
    ).rejects.toThrow();
  });
});
