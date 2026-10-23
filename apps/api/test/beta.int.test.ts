import "reflect-metadata";
import { randomBytes, randomUUID } from "node:crypto";
import type { NestExpressApplication } from "@nestjs/platform-express";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { z } from "zod";
import {
  AdminProblemReportPageSchema,
  AdminProblemReportSchema,
  BetaInvitationCreatedSchema,
  BetaInvitationPageSchema,
  BetaInvitationSchema,
  BetaSettingsSchema,
  BetaStatusSchema,
  ProblemDetailsSchema,
  ProblemReportReceiptSchema,
  SignupStartedSchema,
} from "@kemdia/contracts";
import { AppModule } from "../src/app.module.js";
import { loadConfig } from "../src/config/env.js";
import { PrismaService } from "../src/database/prisma.service.js";
import { TransactionContext } from "../src/database/transaction-context.js";
import { configureApp } from "../src/http/configure-app.js";
import { FeedbackPersonalData } from "../src/modules/feedback/index.js";
import { IdentityPersonalData, SessionService } from "../src/modules/identity/index.js";
import { OTP_SENDER } from "../src/modules/identity/application/ports.js";
import { Account } from "../src/modules/identity/domain/account.js";
import { requireIdentifier } from "../src/modules/identity/domain/identifier.js";
import { PrismaAccountRepository } from "../src/modules/identity/infrastructure/prisma-account.repository.js";
import { RecordingOtpSender } from "./identity/in-memory.js";
import { testDatabaseUrl } from "./integration-db.js";
import { confirmSecondFactor } from "./second-factor-helper.js";

const INTERNAL_KEY = randomBytes(32).toString("base64url");
const matches = <T>(schema: z.ZodType<T>, body: unknown): T => {
  const result = schema.safeParse(body);
  if (!result.success) throw new Error(z.prettifyError(result.error));
  return result.data;
};
const codeOf = (body: unknown) => matches(ProblemDetailsSchema, body).code;
type Session = { token: string; accountId: string };

/** Bêta fermée et « Signaler un problème » (S8-T02, ADR-0057) sur une vraie base. */
describe("Bêta fermée et signalements (PostgreSQL, HTTP)", () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;
  const sender = new RecordingOtpSender(["email"]);

  const call = (method: "get" | "post" | "put", url: string, token?: string) => {
    const server = request(app.getHttpServer());
    const req = server[method](url).set("X-Kemdia-Internal-Key", INTERNAL_KEY);
    return token ? req.set("Authorization", `Bearer ${token}`) : req;
  };

  async function openSession(role?: "ADMIN" | "SUPPORT"): Promise<Session> {
    const email = `beta.${randomUUID()}@exemple.ga`;
    const now = new Date();
    const account = Account.register({
      id: randomUUID(),
      firstName: "Awa",
      lastName: "Ndong",
      identifier: requireIdentifier(email),
      passwordHash: "$argon2id$v=19$m=19456,t=2,p=1$c2Vs$aGFjaGFnZQ",
      now,
    });
    account.markVerified(requireIdentifier(email), now);
    await new PrismaAccountRepository(prisma).save(account);
    if (role) await prisma.accountRole.create({ data: { accountId: account.id, role } });
    const opened = await app.get(SessionService).open(account);
    if (role) await confirmSecondFactor(prisma, account.id);
    return { token: opened.token, accountId: account.id };
  }

  const setClosed = async (admin: Session, closed: boolean) =>
    matches(
      BetaSettingsSchema,
      (await call("put", "/api/v1/admin/beta/settings", admin.token).send({ closed }).expect(200))
        .body,
    );

  const startSignup = (identifier: string) =>
    call("post", "/api/v1/auth/signup").send({
      firstName: "Invité",
      lastName: "Bêta",
      identifier,
      password: "Mangue2026",
      acceptTerms: true,
      adult: true,
    });

  beforeAll(async () => {
    const config = loadConfig({
      NODE_ENV: "test",
      LOG_LEVEL: "silent",
      DATABASE_URL: testDatabaseUrl(),
      API_INTERNAL_KEY: INTERNAL_KEY,
      PUBLIC_SITE_URL: "https://kemdia.example",
    });
    const moduleRef = await Test.createTestingModule({ imports: [AppModule.register(config)] })
      .overrideProvider(OTP_SENDER)
      .useValue(sender)
      .compile();
    app = moduleRef.createNestApplication<NestExpressApplication>({ logger: false });
    configureApp(app, config);
    await app.init();
    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
    // Les autres fichiers de tests créent des comptes : la bêta repart ouverte
    await prisma?.betaSettings.update({ where: { id: 1 }, data: { closed: false } });
    await app?.close();
  });

  it("réglage : ouvert par défaut, public en lecture, changé par l'administrateur seulement (journalisé)", async () => {
    expect(
      matches(BetaStatusSchema, (await call("get", "/api/v1/auth/beta").expect(200)).body),
    ).toEqual({ closed: false });
    const client = await openSession();
    expect(
      codeOf(
        (
          await call("put", "/api/v1/admin/beta/settings", client.token)
            .send({ closed: true })
            .expect(403)
        ).body,
      ),
    ).toBe("ACCES_REFUSE");
    const admin = await openSession("ADMIN");
    // Jamais changé depuis la migration : pas de date « changé le »
    expect(
      matches(
        BetaSettingsSchema,
        (await call("get", "/api/v1/admin/beta/settings", admin.token).expect(200)).body,
      ),
    ).toEqual({ closed: false, updatedAt: null });
    expect((await setClosed(admin, true)).closed).toBe(true);
    expect(
      matches(BetaStatusSchema, (await call("get", "/api/v1/auth/beta").expect(200)).body),
    ).toEqual({ closed: true });
    const event = await prisma.auditEvent.findFirst({
      where: { action: "settings.beta_updated", actorId: admin.accountId },
    });
    expect(event?.details).toEqual({ state: "closed" });
    await setClosed(admin, false);
  });

  it("fermée : sans invitation → 403 ; invitée → compte créé, invitation utilisée et plus annulable", async () => {
    const admin = await openSession("ADMIN");
    await setClosed(admin, true);
    const email = `invite.${randomUUID()}@exemple.ga`;
    expect(codeOf((await startSignup(email).expect(403)).body)).toBe("INVITATION_REQUISE");

    const created = matches(
      BetaInvitationCreatedSchema,
      (
        await call("post", "/api/v1/admin/beta/invitations", admin.token)
          .send({ identifier: email.toUpperCase(), kind: "tester" })
          .expect(201)
      ).body,
    );
    expect(created).toMatchObject({
      notified: true,
      invitation: { identifier: email, kind: "tester", status: "active", usedAt: null },
    });
    await new Promise((resolve) => setImmediate(resolve));
    expect(sender.sent.at(-1)).toMatchObject({
      kind: "beta-invitation",
      to: email,
      link: "https://kemdia.example/inscription",
    });
    // Journal : jamais l'adresse
    const invited = await prisma.auditEvent.findFirst({
      where: { action: "beta.invited", targetId: created.invitation.id },
    });
    expect(JSON.stringify(invited)).not.toContain(email);

    const started = matches(SignupStartedSchema, (await startSignup(email).expect(202)).body);
    await call("post", "/api/v1/auth/signup/verify")
      .send({ ticket: started.ticket, code: sender.lastCode() })
      .expect(200);
    const page = matches(
      BetaInvitationPageSchema,
      (await call("get", "/api/v1/admin/beta/invitations?limit=100", admin.token).expect(200)).body,
    );
    expect(page.items.find((i) => i.id === created.invitation.id)).toMatchObject({
      status: "used",
    });
    expect(
      codeOf(
        (
          await call(
            "post",
            `/api/v1/admin/beta/invitations/${created.invitation.id}/revoke`,
            admin.token,
          ).expect(409)
        ).body,
      ),
    ).toBe("INVITATION_UTILISEE");
    // L'adresse a maintenant un compte : plus d'invitation possible
    expect(
      codeOf(
        (
          await call("post", "/api/v1/admin/beta/invitations", admin.token)
            .send({ identifier: email, kind: "tester" })
            .expect(409)
        ).body,
      ),
    ).toBe("COMPTE_EXISTANT");
    await setClosed(admin, false);
  });

  it("invitation annulée : l'inscription est refusée ; une relance la rend de nouveau valable", async () => {
    const admin = await openSession("ADMIN");
    await setClosed(admin, true);
    const email = `annule.${randomUUID()}@exemple.ga`;
    const { invitation } = matches(
      BetaInvitationCreatedSchema,
      (
        await call("post", "/api/v1/admin/beta/invitations", admin.token)
          .send({ identifier: email, kind: "partner_vendor" })
          .expect(201)
      ).body,
    );
    const revoked = matches(
      BetaInvitationSchema,
      (
        await call(
          "post",
          `/api/v1/admin/beta/invitations/${invitation.id}/revoke`,
          admin.token,
        ).expect(200)
      ).body,
    );
    expect(revoked.status).toBe("revoked");
    expect(codeOf((await startSignup(email).expect(403)).body)).toBe("INVITATION_REQUISE");
    const renewed = matches(
      BetaInvitationCreatedSchema,
      (
        await call("post", "/api/v1/admin/beta/invitations", admin.token)
          .send({ identifier: email, kind: "partner_vendor" })
          .expect(201)
      ).body,
    );
    expect(renewed.invitation).toMatchObject({ id: invitation.id, status: "active" });
    await startSignup(email).expect(202);
    await call("post", "/api/v1/admin/beta/invitations/pas-un-uuid/revoke", admin.token).expect(
      400,
    );
    await setClosed(admin, false);
  });

  it("signaler un problème : compte connecté, page réduite à son chemin, suivi par le service client", async () => {
    const awa = await openSession();
    await call("post", "/api/v1/feedback/problems")
      .send({ category: "bug", message: "Le panier se vide tout seul." })
      .expect(401);
    expect(
      codeOf(
        (
          await call("post", "/api/v1/feedback/problems", awa.token)
            .send({ category: "bug", message: "court" })
            .expect(422)
        ).body,
      ),
    ).toBe("SIGNALEMENT_INVALIDE");
    const receipt = matches(
      ProblemReportReceiptSchema,
      (
        await call("post", "/api/v1/feedback/problems", awa.token)
          .set("X-Kemdia-User-Agent", "Mozilla/5.0 (Linux; Android 14) Chrome/130.0 Mobile")
          .send({
            category: "payment",
            message: "  Le paiement Airtel Money tourne sans fin.  ",
            page: "/commande/confirmation?ticket=secret#haut",
          })
          .expect(201)
      ).body,
    );

    const client = await openSession();
    await call("get", "/api/v1/admin/problems", client.token).expect(403);
    const support = await openSession("SUPPORT");
    const queue = matches(
      AdminProblemReportPageSchema,
      (await call("get", "/api/v1/admin/problems?limit=100", support.token).expect(200)).body,
    );
    const mine = queue.items.find((p) => p.id === receipt.id);
    expect(mine).toMatchObject({
      category: "payment",
      message: "Le paiement Airtel Money tourne sans fin.",
      page: "/commande/confirmation",
      device: "Chrome sur Android",
      status: "new",
      reporter: { name: "Awa Ndong" },
    });
    if (!mine) throw new Error("signalement absent");

    const moved = matches(
      AdminProblemReportSchema,
      (
        await call("post", `/api/v1/admin/problems/${receipt.id}/status`, support.token)
          .send({ status: "in_progress", version: mine.updatedAt })
          .expect(200)
      ).body,
    );
    expect(moved.status).toBe("in_progress");
    // Version périmée : un collègue l'a changé depuis
    expect(
      codeOf(
        (
          await call("post", `/api/v1/admin/problems/${receipt.id}/status`, support.token)
            .send({ status: "resolved", version: mine.updatedAt })
            .expect(409)
        ).body,
      ),
    ).toBe("SIGNALEMENT_MODIFIE");
    const event = await prisma.auditEvent.findFirst({
      where: { action: "problem.updated", targetId: receipt.id },
    });
    expect(event?.details).toEqual({ from: "new", to: "in_progress" });

    // Données personnelles : dans la copie, effacés avec le compte
    const tx = app.get(TransactionContext);
    const data = app.get(FeedbackPersonalData);
    const copy = await tx.run(() => data.export(awa.accountId));
    expect(copy).toEqual([
      expect.objectContaining({ genre: "payment", page: "/commande/confirmation" }),
    ]);
    await tx.run(() => data.erase(awa.accountId));
    expect(await prisma.problemReport.count({ where: { accountId: awa.accountId } })).toBe(0);
  });

  it("deux invitations simultanées de la même adresse : une seule ligne, pas d'erreur", async () => {
    const admin = await openSession("ADMIN");
    const email = `double.${randomUUID()}@exemple.ga`;
    const send = () =>
      call("post", "/api/v1/admin/beta/invitations", admin.token).send({
        identifier: email,
        kind: "tester",
      });
    const [a, b] = await Promise.all([send(), send()]);
    expect([a.status, b.status]).toEqual([201, 201]);
    expect(await prisma.betaInvitation.count({ where: { identifier: email } })).toBe(1);
  });

  it("la base refuse un chemin qui mène à un autre site", async () => {
    const awa = await openSession();
    await expect(
      prisma.problemReport.create({
        data: {
          id: randomUUID(),
          accountId: awa.accountId,
          category: "BUG",
          message: "Description assez longue",
          page: "//pirate.example",
          status: "NEW",
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      }),
    ).rejects.toThrow();
  });

  it("effacer un compte efface son invitation", async () => {
    const admin = await openSession("ADMIN");
    const email = `efface.${randomUUID()}@exemple.ga`;
    await call("post", "/api/v1/admin/beta/invitations", admin.token)
      .send({ identifier: email, kind: "tester" })
      .expect(201);
    const started = matches(SignupStartedSchema, (await startSignup(email).expect(202)).body);
    await call("post", "/api/v1/auth/signup/verify")
      .send({ ticket: started.ticket, code: sender.lastCode() })
      .expect(200);
    const account = await prisma.account.findUniqueOrThrow({ where: { email } });
    expect(await prisma.betaInvitation.count({ where: { usedBy: account.id } })).toBe(1);
    const tx = app.get(TransactionContext);
    const identity = app.get(IdentityPersonalData);
    expect(await tx.run(() => identity.export(account.id))).toMatchObject({
      invitationBeta: { genre: "TESTER" },
    });
    await tx.run(() => identity.erase(account.id, new Date()));
    expect(await prisma.betaInvitation.count({ where: { identifier: email } })).toBe(0);
  });
});
