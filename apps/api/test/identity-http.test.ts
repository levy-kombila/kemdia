import "reflect-metadata";
import type { NestExpressApplication } from "@nestjs/platform-express";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { z } from "zod";
import {
  IDENTITY_ERROR_CODES,
  ProblemDetailsSchema,
  SignupStartedSchema,
  SignupVerifiedSchema,
} from "@kemdia/contracts";
import { AppModule } from "../src/app.module.js";
import { loadConfig } from "../src/config/env.js";
import { DatabaseHealth } from "../src/database/database-health.js";
import { configureApp } from "../src/http/configure-app.js";
import {
  ACCOUNT_REPOSITORY,
  IDENTITY_CLOCK,
  OTP_CHALLENGE_REPOSITORY,
  OTP_SENDER,
  PASSWORD_HASHER,
  SIGNUP_TICKET_REPOSITORY,
} from "../src/modules/identity/application/ports.js";
import { IDENTITY_ERROR_STATUS } from "../src/modules/identity/interface/identity-http-errors.js";
import {
  FakeClock,
  InMemoryAccounts,
  InMemoryOtpChallenges,
  InMemorySignupTickets,
  RecordingOtpSender,
  fakeHasher,
} from "./identity/in-memory.js";

/**
 * Routes HTTP de l'inscription, sans base (dépôts en mémoire). Chaque réponse est confrontée au contrat.
 * Le SQL réel est testé dans test/identity.int.test.ts.
 */
const matches = <T>(schema: z.ZodType<T>, body: unknown): T => {
  const result = schema.safeParse(body);
  if (!result.success) throw new Error(z.prettifyError(result.error));
  return result.data;
};

/** Code d'une réponse d'erreur, vérifiée contre le contrat. */
const codeOf = (body: unknown) => matches(ProblemDetailsSchema, body).code;

const SIGNUP = {
  firstName: "Awa",
  lastName: "Ndong",
  identifier: "awa@exemple.ga",
  password: "Mangue2026",
  acceptTerms: true,
};

describe("API identité — inscription (HTTP)", () => {
  let app: NestExpressApplication;
  let accounts: InMemoryAccounts;
  let sender: RecordingOtpSender;
  let clock: FakeClock;
  let ip = 0;
  const post = (url: string, body: object) =>
    request(app.getHttpServer()).post(url).set("X-Forwarded-For", `10.1.0.${++ip}`).send(body);

  beforeAll(async () => {
    const config = loadConfig({ NODE_ENV: "test", LOG_LEVEL: "silent", TRUST_PROXY: "1" });
    accounts = new InMemoryAccounts();
    sender = new RecordingOtpSender(["email"]);
    clock = new FakeClock();
    const moduleRef = await Test.createTestingModule({ imports: [AppModule.register(config)] })
      .overrideProvider(DatabaseHealth)
      .useValue({ check: () => Promise.resolve("ok") })
      .overrideProvider(ACCOUNT_REPOSITORY)
      .useValue(accounts)
      .overrideProvider(OTP_CHALLENGE_REPOSITORY)
      .useValue(new InMemoryOtpChallenges())
      .overrideProvider(SIGNUP_TICKET_REPOSITORY)
      .useValue(new InMemorySignupTickets())
      .overrideProvider(PASSWORD_HASHER)
      .useValue(fakeHasher)
      .overrideProvider(OTP_SENDER)
      .useValue(sender)
      .overrideProvider(IDENTITY_CLOCK)
      .useValue(clock)
      .compile();
    app = moduleRef.createNestApplication<NestExpressApplication>({ logger: false });
    configureApp(app, config);
    await app.init();
  });
  afterAll(async () => {
    await app.close();
  });
  beforeEach(() => {
    // Chaque test part d'une heure nouvelle : les limites d'envoi des tests précédents ne comptent plus
    clock.advance(2 * 60 * 60_000);
  });

  it("parcours complet : inscription (202), code reçu, vérification (200), jamais en cache", async () => {
    const started = await post("/api/v1/auth/signup", {
      ...SIGNUP,
      identifier: "parcours@exemple.ga",
    }).expect(202);
    const body = matches(SignupStartedSchema, started.body);
    expect(body).toMatchObject({
      channel: "email",
      sentTo: "pa•••@exemple.ga",
      resendInSeconds: 60,
    });
    expect(started.headers["cache-control"]).toBe("no-store");

    const verified = await post("/api/v1/auth/signup/verify", {
      ticket: body.ticket,
      code: sender.lastCode(),
    }).expect(200);
    expect(matches(SignupVerifiedSchema, verified.body)).toEqual({ status: "active" });
    const account = await accounts.findByIdentifier({
      kind: "email",
      value: "parcours@exemple.ga",
    });
    expect(account?.status).toBe("active");
  });

  it("compte existant : même statut, mêmes champs (pas d'énumération)", async () => {
    const first = await post("/api/v1/auth/signup", {
      ...SIGNUP,
      identifier: "deja@exemple.ga",
    }).expect(202);
    const { ticket } = matches(SignupStartedSchema, first.body);
    await post("/api/v1/auth/signup/verify", { ticket, code: sender.lastCode() }).expect(200);
    clock.advance(60_000);
    const again = await post("/api/v1/auth/signup", {
      ...SIGNUP,
      identifier: "deja@exemple.ga",
    }).expect(202);
    expect(Object.keys(again.body as object).sort()).toEqual(
      Object.keys(first.body as object).sort(),
    );
    expect(sender.sent.at(-1)).toMatchObject({ kind: "signup-alert", to: "deja@exemple.ga" });
  });

  it("erreurs métier : statut, code stable, message en français", async () => {
    const weak = await post("/api/v1/auth/signup", { ...SIGNUP, password: "azerty123" }).expect(
      422,
    );
    expect(matches(ProblemDetailsSchema, weak.body)).toMatchObject({
      code: "MOT_DE_PASSE_FAIBLE",
      detail: expect.stringMatching(/^Mot de passe refusé/),
    });
    expect(weak.headers["content-type"]).toContain("application/problem+json");
    expect(JSON.stringify(weak.body)).not.toContain("azerty123");

    const sms = await post("/api/v1/auth/signup", { ...SIGNUP, identifier: "077123456" }).expect(
      422,
    );
    expect(sms.body).toMatchObject({
      code: "CANAL_INDISPONIBLE",
      detail: expect.stringMatching(/SMS/),
    });
  });

  it("codes faux, puis trop d'essais ; ticket inconnu → 410", async () => {
    const started = await post("/api/v1/auth/signup", {
      ...SIGNUP,
      identifier: "essais@exemple.ga",
    }).expect(202);
    const { ticket } = matches(SignupStartedSchema, started.body);
    for (let i = 0; i < 4; i++) {
      const res = await post("/api/v1/auth/signup/verify", { ticket, code: "000000" }).expect(422);
      expect(codeOf(res.body)).toBe("CODE_INVALIDE");
    }
    const blocked = await post("/api/v1/auth/signup/verify", { ticket, code: "000000" }).expect(
      429,
    );
    expect(codeOf(blocked.body)).toBe("TROP_D_ESSAIS");

    const unknown = await post("/api/v1/auth/signup/verify", {
      ticket: "x".repeat(43),
      code: "123456",
    }).expect(410);
    expect(unknown.body).toMatchObject({ code: "CODE_EXPIRE", title: "Ressource expirée" });
  });

  it("renvoi trop rapide : 429 avec Retry-After ; après 60 s : nouveau code", async () => {
    const started = await post("/api/v1/auth/signup", {
      ...SIGNUP,
      identifier: "renvoi@exemple.ga",
    }).expect(202);
    const { ticket } = matches(SignupStartedSchema, started.body);
    const early = await post("/api/v1/auth/signup/resend", { ticket }).expect(429);
    expect(codeOf(early.body)).toBe("ENVOI_TROP_RAPPROCHE");
    expect(early.headers["retry-after"]).toBe("60");
    clock.advance(60_000);
    const again = await post("/api/v1/auth/signup/resend", { ticket }).expect(202);
    expect(matches(SignupStartedSchema, again.body).ticket).toBe(ticket);
  });

  it("fournisseur d'e-mails en panne : même réponse 202 (l'échec ne se voit que dans les journaux)", async () => {
    const original = sender.send.bind(sender);
    sender.send = () => Promise.reject(new Error("Brevo : réponse HTTP 401"));
    try {
      const res = await post("/api/v1/auth/signup", {
        ...SIGNUP,
        identifier: "panne@exemple.ga",
      }).expect(202);
      matches(SignupStartedSchema, res.body);
      expect(JSON.stringify(res.body)).not.toMatch(/Brevo|401/);
    } finally {
      sender.send = original;
    }
  });

  it("corps invalide : conditions non acceptées, champ inconnu, code mal formé → 400", async () => {
    await post("/api/v1/auth/signup", { ...SIGNUP, acceptTerms: false }).expect(400);
    await post("/api/v1/auth/signup", { ...SIGNUP, role: "admin" }).expect(400);
    await post("/api/v1/auth/signup/verify", { ticket: "x".repeat(43), code: "12345" }).expect(400);
  });

  it("limite par adresse IP : 10 inscriptions par minute", async () => {
    const from = "10.2.0.1";
    let last = 0;
    for (let i = 0; i < 11; i++) {
      const res = await request(app.getHttpServer())
        .post("/api/v1/auth/signup")
        .set("X-Forwarded-For", from)
        .send({ ...SIGNUP, identifier: `ip${i}@exemple.ga` });
      last = res.status;
    }
    expect(last).toBe(429);
  });

  it("chaque code d'erreur du contrat a un statut HTTP", () => {
    expect(Object.keys(IDENTITY_ERROR_STATUS).sort()).toEqual([...IDENTITY_ERROR_CODES].sort());
  });
});
