import "reflect-metadata";
import { randomBytes, randomUUID } from "node:crypto";
import type { NestExpressApplication } from "@nestjs/platform-express";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { z } from "zod";
import {
  ProblemDetailsSchema,
  RecoveryCodesSchema,
  SecondFactorEnabledSchema,
  SecondFactorSetupSchema,
  SecondFactorStatusSchema,
  SecondFactorVerifiedSchema,
} from "@kemdia/contracts";
import { AppModule } from "../src/app.module.js";
import { loadConfig } from "../src/config/env.js";
import { PrismaService } from "../src/database/prisma.service.js";
import { configureApp } from "../src/http/configure-app.js";
import { SecondFactorService, SessionService } from "../src/modules/identity/index.js";
import {
  SECOND_FACTOR_REPOSITORY,
  type SecondFactorRepository,
} from "../src/modules/identity/application/ports.js";
import { Account } from "../src/modules/identity/domain/account.js";
import { requireIdentifier } from "../src/modules/identity/domain/identifier.js";
import { base32Decode, totpCode, totpStep } from "../src/modules/identity/domain/totp.js";
import { Argon2PasswordHasher } from "../src/modules/identity/infrastructure/argon2-password-hasher.js";
import { PrismaAccountRepository } from "../src/modules/identity/infrastructure/prisma-account.repository.js";
import { testDatabaseUrl } from "./integration-db.js";

/**
 * Double authentification de l'équipe sur une VRAIE base (S6-T03, ADR-0034, MED-15), par HTTP : activation (QR code,
 * premier code, codes de secours), routes d'administration fermées sans confirmation, rejeu refusé, blocage après
 * 3 codes faux, commande serveur, règles de la base. Les codes sont calculés comme le ferait le téléphone.
 */
const INTERNAL_KEY = randomBytes(32).toString("base64url");
const PASSWORD = "Mangue2026";

const matches = <T>(schema: z.ZodType<T>, body: unknown): T => {
  const result = schema.safeParse(body);
  if (!result.success) throw new Error(z.prettifyError(result.error));
  return result.data;
};
const codeOf = (body: unknown) => matches(ProblemDetailsSchema, body).code;
const phoneCode = (secret: string, offset = 0) =>
  totpCode(base32Decode(secret), totpStep(new Date()) + offset);

describe("Double authentification de l'équipe (PostgreSQL, HTTP)", () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;
  let admin = { token: "", accountId: "", email: "" };
  let passwordHash = "";

  const call = (method: "get" | "post", url: string, token: string) => {
    const server = request(app.getHttpServer());
    const req = method === "get" ? server.get(url) : server.post(url);
    return req.set("X-Kemdia-Internal-Key", INTERNAL_KEY).set("Authorization", `Bearer ${token}`);
  };
  const post = (url: string, body: object = {}, token = admin.token) =>
    call("post", url, token).send(body);

  async function openSession(role?: "ADMIN" | "CATALOG") {
    const email = `equipe.${randomUUID()}@exemple.ga`;
    const now = new Date();
    const account = Account.register({
      id: randomUUID(),
      firstName: "Ada",
      lastName: "Mba",
      identifier: requireIdentifier(email),
      passwordHash,
      now,
    });
    account.markVerified(requireIdentifier(email), now);
    await new PrismaAccountRepository(prisma).save(account);
    if (role) await prisma.accountRole.create({ data: { accountId: account.id, role } });
    const opened = await app.get(SessionService).open(account);
    return { token: opened.token, accountId: account.id, email };
  }

  /** Activation complète par HTTP ; renvoie le secret et les codes de secours. */
  async function enroll(token = admin.token) {
    const setup = matches(
      SecondFactorSetupSchema,
      (await post("/api/v1/auth/2fa/setup", { password: PASSWORD }, token).expect(200)).body,
    );
    const enabled = matches(
      SecondFactorEnabledSchema,
      (await post("/api/v1/auth/2fa/enable", { code: phoneCode(setup.secret) }, token).expect(200))
        .body,
    );
    return { secret: setup.secret, recoveryCodes: enabled.recoveryCodes };
  }

  beforeAll(async () => {
    const config = loadConfig({
      NODE_ENV: "test",
      LOG_LEVEL: "silent",
      DATABASE_URL: testDatabaseUrl(),
      API_INTERNAL_KEY: INTERNAL_KEY,
    });
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule.register(config)],
    }).compile();
    app = moduleRef.createNestApplication<NestExpressApplication>({ logger: false });
    configureApp(app, config);
    await app.init();
    prisma = app.get(PrismaService);
    // Vrai hachage Argon2id : le QR code redemande le mot de passe
    passwordHash = await new Argon2PasswordHasher().hash(PASSWORD);
  });

  beforeEach(async () => {
    admin = await openSession("ADMIN");
  });

  afterAll(async () => {
    await app.close();
  });

  it("parcours : route fermée → QR code → premier code → route ouverte ; secret chiffré en base", async () => {
    const before = await call("get", "/api/v1/admin/shops", admin.token).expect(403);
    expect(codeOf(before.body)).toBe("DEUX_FACTEURS_A_ACTIVER");
    const status = matches(
      SecondFactorStatusSchema,
      (await call("get", "/api/v1/auth/2fa", admin.token).expect(200)).body,
    );
    expect(status).toEqual({
      enabled: false,
      required: true,
      verifiedUntil: null,
      recoveryCodesLeft: 0,
    });

    const wrong = await post("/api/v1/auth/2fa/setup", { password: "Ananas2026" }).expect(422);
    expect(codeOf(wrong.body)).toBe("MOT_DE_PASSE_INCORRECT");
    const setupRes = await post("/api/v1/auth/2fa/setup", { password: PASSWORD }).expect(200);
    expect(setupRes.headers["cache-control"]).toBe("no-store");
    const { secret } = matches(SecondFactorSetupSchema, setupRes.body);
    const row = await prisma.secondFactor.findUniqueOrThrow({
      where: { accountId: admin.accountId },
    });
    expect(row.secretBox).toHaveLength(49);
    expect(Buffer.from(row.secretBox).includes(Buffer.from(base32Decode(secret)))).toBe(false);

    const enabled = matches(
      SecondFactorEnabledSchema,
      (await post("/api/v1/auth/2fa/enable", { code: phoneCode(secret) }).expect(200)).body,
    );
    expect(enabled.recoveryCodes).toHaveLength(10);
    const stored = await prisma.recoveryCode.findMany({ where: { accountId: admin.accountId } });
    expect(stored).toHaveLength(10);
    expect(stored.map((c) => c.codeHash)).not.toContain(enabled.recoveryCodes[0]);

    await call("get", "/api/v1/admin/shops", admin.token).expect(200);
    const events = await prisma.auditEvent.findMany({
      where: { targetId: admin.accountId, action: { startsWith: "mfa." } },
    });
    // Le mauvais mot de passe du début est journalisé (relecture S6-T03)
    expect(events.map((e) => e.action)).toEqual(["mfa.failed", "mfa.enabled"]);
  });

  it("autre session : confirmation par code ; le même code ne sert pas deux fois", async () => {
    const { secret } = await enroll();
    const other = await app
      .get(SessionService)
      .open((await new PrismaAccountRepository(prisma).findById(admin.accountId))!);
    expect(codeOf((await call("get", "/api/v1/admin/shops", other.token).expect(403)).body)).toBe(
      "DEUX_FACTEURS_REQUIS",
    );
    // Code de la période suivante (accepté : décalage d'horloge), puis rejoué
    const next = phoneCode(secret, 1);
    matches(
      SecondFactorVerifiedSchema,
      (await post("/api/v1/auth/2fa/verify", { code: next }, other.token).expect(200)).body,
    );
    await call("get", "/api/v1/admin/shops", other.token).expect(200);
    const replay = await post("/api/v1/auth/2fa/verify", { code: next }, admin.token).expect(422);
    expect(codeOf(replay.body)).toBe("CODE_INVALIDE");
  });

  it("code de secours une seule fois ; nouveaux codes contre un code frais ; 3e code faux → session fermée", async () => {
    const { secret, recoveryCodes } = await enroll();
    const other = await app
      .get(SessionService)
      .open((await new PrismaAccountRepository(prisma).findById(admin.accountId))!);
    const used = matches(
      SecondFactorVerifiedSchema,
      (await post("/api/v1/auth/2fa/verify", { code: recoveryCodes[0] }, other.token).expect(200))
        .body,
    );
    expect(used.recoveryCodesLeft).toBe(9);
    const fresh = matches(
      RecoveryCodesSchema,
      (
        await post(
          "/api/v1/auth/2fa/recovery-codes",
          { code: phoneCode(secret, 1) },
          other.token,
        ).expect(200)
      ).body,
    );
    expect(fresh.recoveryCodes).not.toContain(recoveryCodes[1]);
    expect(
      codeOf((await post("/api/v1/auth/2fa/verify", { code: recoveryCodes[1] }).expect(422)).body),
    ).toBe("CODE_INVALIDE");
    await post("/api/v1/auth/2fa/verify", { code: "000000" }).expect(422);
    const locked = await post("/api/v1/auth/2fa/verify", { code: "000000" }).expect(429);
    expect(codeOf(locked.body)).toBe("TROP_D_ESSAIS");
    expect(Number(locked.headers["retry-after"])).toBeGreaterThan(800);
    // La session de l'essai est fermée ; les autres attendent la fin du blocage
    await call("get", "/api/v1/auth/2fa", admin.token).expect(401);
    await post("/api/v1/auth/2fa/verify", { code: fresh.recoveryCodes[0] }, other.token).expect(
      429,
    );
    const journal = await prisma.auditEvent.findMany({
      where: { targetId: admin.accountId, action: "mfa.locked" },
    });
    expect(journal).toHaveLength(1);
  });

  it("modérateur : 2FA obligatoire aussi ; client ou vendeur : refusée", async () => {
    const moderator = await openSession("CATALOG");
    const status = matches(
      SecondFactorStatusSchema,
      (await call("get", "/api/v1/auth/2fa", moderator.token).expect(200)).body,
    );
    expect(status.required).toBe(true);
    await enroll(moderator.token);
    const client = await openSession();
    expect(
      codeOf(
        (await post("/api/v1/auth/2fa/setup", { password: PASSWORD }, client.token).expect(403))
          .body,
      ),
    ).toBe("ACCES_REFUSE");
  });

  it("commande serveur : 2FA remise à zéro, sessions fermées, journal ; base protégée", async () => {
    const { secret } = await enroll();
    await call("get", "/api/v1/admin/shops", admin.token).expect(200);
    const reset = await app.get(SecondFactorService).resetFromServer(admin.email);
    expect(reset).toEqual({ accountId: admin.accountId, changed: true });
    // Toutes les sessions sont fermées : il faut se reconnecter
    expect(codeOf((await call("get", "/api/v1/admin/shops", admin.token).expect(401)).body)).toBe(
      "SESSION_INVALIDE",
    );
    expect(await prisma.recoveryCode.count({ where: { accountId: admin.accountId } })).toBe(0);
    const resetEvent = await prisma.auditEvent.findFirst({
      where: { targetId: admin.accountId, action: "mfa.reset" },
    });
    expect(resetEvent).toMatchObject({ actorType: "SYSTEM" });
    expect(phoneCode(secret)).toMatch(/^\d{6}$/);
    // Relecture S6-T03 : l'ancien mot de passe ne sert plus (un voleur qui le connaît ne se reconnecte pas)
    const login = await request(app.getHttpServer())
      .post("/api/v1/auth/login")
      .set("X-Kemdia-Internal-Key", INTERNAL_KEY)
      .send({ identifier: admin.email, password: PASSWORD })
      .expect(401);
    expect(codeOf(login.body)).toBe("IDENTIFIANTS_INCORRECTS");
    // Le titulaire choisit un nouveau mot de passe (« Mot de passe oublié », simulé ici)
    await prisma.account.update({ where: { id: admin.accountId }, data: { passwordHash } });

    // Base : une période utilisée ne recule pas ; un code de secours utilisé ne change plus
    const reopened = await app
      .get(SessionService)
      .open((await new PrismaAccountRepository(prisma).findById(admin.accountId))!);
    admin = { ...admin, token: reopened.token };
    expect(codeOf((await call("get", "/api/v1/admin/shops", admin.token).expect(403)).body)).toBe(
      "DEUX_FACTEURS_A_ACTIVER",
    );
    const again = await enroll();
    await expect(
      prisma.secondFactor.update({
        where: { accountId: admin.accountId },
        data: { lastUsedStep: 1n },
      }),
    ).rejects.toThrow();
    await post("/api/v1/auth/2fa/verify", { code: again.recoveryCodes[0] }).expect(200);
    await expect(
      prisma.recoveryCode.updateMany({
        where: { accountId: admin.accountId, usedAt: { not: null } },
        data: { usedAt: null },
      }),
    ).rejects.toThrow();
  });

  it("relecture S6-T03 : échecs comptés sur 24 heures en base (jamais remis à zéro avant)", async () => {
    await enroll();
    const repo = app.get<SecondFactorRepository>(SECOND_FACTOR_REPOSITORY);
    const t0 = new Date(Date.now() + 60_000);
    const at = (minutes: number) => new Date(t0.getTime() + minutes * 60_000);
    const day = 24 * 60 * 60_000;
    expect(await repo.recordFailure(admin.accountId, at(0), day)).toBe(1);
    expect(await repo.recordFailure(admin.accountId, at(30), day)).toBe(2);
    expect(await repo.recordFailure(admin.accountId, at(23 * 60), day)).toBe(3);
    // Plus de 24 heures après le premier échec : la fenêtre repart
    expect(await repo.recordFailure(admin.accountId, at(24 * 60 + 1), day)).toBe(1);
    // Sans double authentification : rien n'est compté
    const client = await openSession();
    expect(await repo.recordFailure(client.accountId, at(0), day)).toBe(0);
    // La base refuse un compteur incohérent
    await expect(
      prisma.secondFactor.update({
        where: { accountId: admin.accountId },
        data: { failedCount: 0 },
      }),
    ).rejects.toThrow();
  });
});
