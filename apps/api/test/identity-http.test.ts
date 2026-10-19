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
  CurrentSessionSchema,
  LogoutAllSchema,
  OpenedSessionSchema,
  ResetStartedSchema,
} from "@kemdia/contracts";
import { AppModule } from "../src/app.module.js";
import { loadConfig } from "../src/config/env.js";
import { DatabaseHealth } from "../src/database/database-health.js";
import { configureApp } from "../src/http/configure-app.js";
import {
  ACCOUNT_REPOSITORY,
  IDENTITY_CLOCK,
  LOGIN_GUARD_REPOSITORY,
  OTP_CHALLENGE_REPOSITORY,
  SESSION_REPOSITORY,
  OTP_SENDER,
  PASSWORD_HASHER,
  RESET_TICKET_REPOSITORY,
  ROLE_REPOSITORY,
  SIGNUP_TICKET_REPOSITORY,
  TRANSACTION_RUNNER,
} from "../src/modules/identity/application/ports.js";
import { AUDIT_REPOSITORY } from "../src/modules/audit/application/ports.js";
import { InMemoryAuditEvents } from "./audit/in-memory.js";
import { IDENTITY_ERROR_STATUS } from "../src/modules/identity/interface/identity-http-errors.js";
import {
  FakeClock,
  InMemoryAccounts,
  InMemoryLoginGuards,
  InMemoryOtpChallenges,
  InMemoryResetTickets,
  InMemorySessions,
  InMemorySignupTickets,
  InMemoryRoles,
  RecordingOtpSender,
  directTransactions,
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
    const sessions = new InMemorySessions();
    const guards = new InMemoryLoginGuards();
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
      .overrideProvider(SESSION_REPOSITORY)
      .useValue(sessions)
      .overrideProvider(LOGIN_GUARD_REPOSITORY)
      .useValue(guards)
      .overrideProvider(RESET_TICKET_REPOSITORY)
      .useValue(new InMemoryResetTickets(accounts, sessions, guards))
      .overrideProvider(ROLE_REPOSITORY)
      .useValue(new InMemoryRoles(accounts))
      .overrideProvider(TRANSACTION_RUNNER)
      .useValue(directTransactions)
      .overrideProvider(AUDIT_REPOSITORY)
      .useValue(new InMemoryAuditEvents())
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
    const opened = matches(SignupVerifiedSchema, verified.body);
    expect(opened).toMatchObject({ status: "active", account: { email: "parcours@exemple.ga" } });
    // Connecté directement : le jeton ouvre la session
    await request(app.getHttpServer())
      .get("/api/v1/auth/session")
      .set("Authorization", `Bearer ${opened.token}`)
      .expect(200);
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

  describe("connexion et sessions", () => {
    /** Crée un compte vérifié par le parcours d'inscription, renvoie l'adresse. */
    async function compte(email: string): Promise<string> {
      const started = await post("/api/v1/auth/signup", { ...SIGNUP, identifier: email }).expect(
        202,
      );
      const { ticket } = matches(SignupStartedSchema, started.body);
      await post("/api/v1/auth/signup/verify", { ticket, code: sender.lastCode() }).expect(200);
      return email;
    }
    const get = (url: string, token?: string) => {
      const r = request(app.getHttpServer()).get(url).set("X-Forwarded-For", `10.3.0.${++ip}`);
      return token ? r.set("Authorization", `Bearer ${token}`) : r;
    };
    const postAuth = (url: string, token: string) =>
      request(app.getHttpServer())
        .post(url)
        .set("X-Forwarded-For", `10.3.0.${++ip}`)
        .set("Authorization", `Bearer ${token}`);

    it("connexion (200), session lue, déconnexion (204), session refusée ensuite (401)", async () => {
      const email = await compte("connexion@exemple.ga");
      const res = await post("/api/v1/auth/login", { identifier: email, password: "Mangue2026" })
        .set("X-Kemdia-User-Agent", "Chrome sur Android")
        .expect(200);
      expect(res.headers["cache-control"]).toBe("no-store");
      const opened = matches(OpenedSessionSchema, res.body);
      expect(opened.account).toMatchObject({ email, firstName: "Awa" });
      expect(JSON.stringify(res.body)).not.toMatch(/hash|Mangue/);

      const current = await get("/api/v1/auth/session", opened.token).expect(200);
      expect(matches(CurrentSessionSchema, current.body).account.email).toBe(email);

      await postAuth("/api/v1/auth/logout", opened.token).expect(204);
      const after = await get("/api/v1/auth/session", opened.token).expect(401);
      expect(codeOf(after.body)).toBe("SESSION_INVALIDE");
    });

    it("sans jeton, jeton mal formé ou jeton dans un autre format : 401", async () => {
      expect(codeOf((await get("/api/v1/auth/session").expect(401)).body)).toBe("SESSION_INVALIDE");
      await get("/api/v1/auth/session", "court").expect(401);
      await request(app.getHttpServer())
        .get("/api/v1/auth/session")
        .set("Authorization", `Basic ${"a".repeat(43)}`)
        .expect(401);
      // Déconnexion sans jeton valable : 204 quand même (rien à fermer)
      await request(app.getHttpServer()).post("/api/v1/auth/logout").expect(204);
    });

    it("blocage neutre : une adresse inconnue et un vrai compte donnent les mêmes réponses", async () => {
      const email = await compte("bloque@exemple.ga");
      const suite = async (identifier: string) => {
        const out: [number, string | undefined][] = [];
        for (let i = 0; i < 4; i++) {
          const r = await post("/api/v1/auth/login", { identifier, password: `faux${i}abc` });
          out.push([r.status, codeOf(r.body)]);
        }
        return out;
      };
      const reel = await suite(email);
      const inconnu = await suite("personne@exemple.ga");
      expect(reel).toEqual(inconnu);
      expect(reel).toEqual([
        [401, "IDENTIFIANTS_INCORRECTS"],
        [401, "IDENTIFIANTS_INCORRECTS"],
        [429, "COMPTE_BLOQUE"],
        [429, "COMPTE_BLOQUE"],
      ]);
      const locked = await post("/api/v1/auth/login", {
        identifier: email,
        password: "Mangue2026",
      }).expect(429);
      expect(locked.headers["retry-after"]).toBe("900");
    });

    it("déconnecter tous les appareils", async () => {
      const email = await compte("appareils@exemple.ga");
      const a = matches(
        OpenedSessionSchema,
        (await post("/api/v1/auth/login", { identifier: email, password: "Mangue2026" })).body,
      );
      const b = matches(
        OpenedSessionSchema,
        (await post("/api/v1/auth/login", { identifier: email, password: "Mangue2026" })).body,
      );
      const res = await postAuth("/api/v1/auth/logout-all", a.token).expect(200);
      // 3 sessions : celle de l'inscription et les deux connexions
      expect(matches(LogoutAllSchema, res.body).revoked).toBe(3);
      await get("/api/v1/auth/session", b.token).expect(401);
    });

    it("mot de passe oublié : 202, puis nouveau mot de passe (200) — connecté ici, déconnecté ailleurs", async () => {
      const email = await compte("oubli@exemple.ga");
      const before = matches(
        OpenedSessionSchema,
        (await post("/api/v1/auth/login", { identifier: email, password: "Mangue2026" })).body,
      );
      const forgot = await post("/api/v1/auth/password/forgot", { identifier: email }).expect(202);
      expect(forgot.headers["cache-control"]).toBe("no-store");
      const { ticket } = matches(ResetStartedSchema, forgot.body);
      const res = await post("/api/v1/auth/password/reset", {
        ticket,
        code: sender.lastCode(),
        newPassword: "Papaye2027",
      })
        .set("X-Kemdia-User-Agent", "Firefox sur Windows")
        .expect(200);
      const opened = matches(OpenedSessionSchema, res.body);
      expect(sender.sent.at(-1)).toMatchObject({ kind: "password-changed", to: email });
      await get("/api/v1/auth/session", before.token).expect(401);
      await get("/api/v1/auth/session", opened.token).expect(200);
      await post("/api/v1/auth/login", { identifier: email, password: "Mangue2026" }).expect(401);
      await post("/api/v1/auth/login", { identifier: email, password: "Papaye2027" }).expect(200);
      // Ticket déjà utilisé
      const again = await post("/api/v1/auth/password/reset", {
        ticket,
        code: "123456",
        newPassword: "Goyave2028",
      }).expect(410);
      expect(codeOf(again.body)).toBe("CODE_EXPIRE");
    });

    it("mot de passe oublié sans compte : même réponse, aucun e-mail", async () => {
      const known = await compte("connu@exemple.ga");
      const sentBefore = sender.sent.length;
      const unknown = await post("/api/v1/auth/password/forgot", {
        identifier: "personne@exemple.ga",
      }).expect(202);
      expect(sender.sent.length).toBe(sentBefore);
      const existing = await post("/api/v1/auth/password/forgot", { identifier: known }).expect(
        202,
      );
      expect(Object.keys(unknown.body as object).sort()).toEqual(
        Object.keys(existing.body as object).sort(),
      );
      matches(ResetStartedSchema, unknown.body);
      // Renvoi trop rapide, identique pour les deux
      const { ticket } = matches(ResetStartedSchema, unknown.body);
      const r = await post("/api/v1/auth/password/resend", { ticket }).expect(429);
      expect(codeOf(r.body)).toBe("ENVOI_TROP_RAPPROCHE");
    });

    it("mot de passe trop faible : 422, le code reste utilisable", async () => {
      const email = await compte("faible@exemple.ga");
      const { ticket } = matches(
        ResetStartedSchema,
        (await post("/api/v1/auth/password/forgot", { identifier: email }).expect(202)).body,
      );
      const code = sender.lastCode();
      const weak = await post("/api/v1/auth/password/reset", {
        ticket,
        code,
        newPassword: "court",
      }).expect(422);
      expect(codeOf(weak.body)).toBe("MOT_DE_PASSE_FAIBLE");
      await post("/api/v1/auth/password/reset", { ticket, code, newPassword: "Papaye2027" }).expect(
        200,
      );
    });

    describe("changer son mot de passe (S7-T07, ASVS 5.0 V6.2.2 et V6.2.3)", () => {
      const change = (token: string, body: object) =>
        postAuth("/api/v1/auth/password/change", token).send(body);
      const auditActions = () =>
        app.get<InMemoryAuditEvents>(AUDIT_REPOSITORY).rows.map((e) => e.action as string);
      async function connecte(email: string) {
        await compte(email);
        const res = await post("/api/v1/auth/login", { identifier: email, password: "Mangue2026" });
        return matches(OpenedSessionSchema, res.body);
      }

      it("mot de passe actuel + nouveau : 200, reconnecté ici, déconnecté partout ailleurs, avis envoyé", async () => {
        const email = "changer@exemple.ga";
        const a = await connecte(email);
        const b = matches(
          OpenedSessionSchema,
          (await post("/api/v1/auth/login", { identifier: email, password: "Mangue2026" })).body,
        );
        const res = await change(a.token, {
          currentPassword: "Mangue2026",
          newPassword: "papaye et goyave",
        })
          .set("X-Kemdia-User-Agent", "Firefox sur Windows")
          .expect(200);
        expect(res.headers["cache-control"]).toBe("no-store");
        const opened = matches(OpenedSessionSchema, res.body);
        expect(opened.token).not.toBe(a.token);
        expect(JSON.stringify(res.body)).not.toMatch(/papaye|Mangue|hash/);
        // Toutes les anciennes sessions fermées (celle-ci comprise), la nouvelle valable
        await get("/api/v1/auth/session", a.token).expect(401);
        await get("/api/v1/auth/session", b.token).expect(401);
        await get("/api/v1/auth/session", opened.token).expect(200);
        await post("/api/v1/auth/login", { identifier: email, password: "Mangue2026" }).expect(401);
        await post("/api/v1/auth/login", {
          identifier: email,
          password: "papaye et goyave",
        }).expect(200);
        expect(sender.sent.at(-1)).toMatchObject({ kind: "password-changed", to: email });
        expect(auditActions()).toContain("password.changed");
      });

      it("sans session : 401 ; nouveau mot de passe trop faible ou courant : 422 sans consommer d'essai", async () => {
        await request(app.getHttpServer())
          .post("/api/v1/auth/password/change")
          .set("X-Forwarded-For", `10.3.0.${++ip}`)
          .send({ currentPassword: "Mangue2026", newPassword: "papaye et goyave" })
          .expect(401);
        const a = await connecte("faible-change@exemple.ga");
        for (const newPassword of ["court", "baseball", "Password"]) {
          const weak = await change(a.token, {
            currentPassword: "faux-faux-faux",
            newPassword,
          }).expect(422);
          expect(codeOf(weak.body)).toBe("MOT_DE_PASSE_FAIBLE");
        }
        // Aucun essai consommé : le bon mot de passe actuel passe toujours
        await change(a.token, {
          currentPassword: "Mangue2026",
          newPassword: "papaye et goyave",
        }).expect(200);
      });

      it("mot de passe actuel faux : 422, puis au 3e essai blocage (429) et session FERMÉE", async () => {
        const email = "voleur@exemple.ga";
        const a = await connecte(email);
        for (let i = 1; i <= 2; i++) {
          const wrong = await change(a.token, {
            currentPassword: `essai-${i}-faux`,
            newPassword: "papaye et goyave",
          }).expect(422);
          expect(codeOf(wrong.body)).toBe("MOT_DE_PASSE_INCORRECT");
        }
        const locked = await change(a.token, {
          currentPassword: "essai-3-faux",
          newPassword: "papaye et goyave",
        }).expect(429);
        expect(codeOf(locked.body)).toBe("COMPTE_BLOQUE");
        await get("/api/v1/auth/session", a.token).expect(401);
        // La CONNEXION du titulaire n'est pas bloquée (compteur à part) ; le changement, si, pendant 15 minutes
        const again = matches(
          OpenedSessionSchema,
          (
            await post("/api/v1/auth/login", { identifier: email, password: "Mangue2026" }).expect(
              200,
            )
          ).body,
        );
        const still = await change(again.token, {
          currentPassword: "Mangue2026",
          newPassword: "papaye et goyave",
        }).expect(429);
        expect(codeOf(still.body)).toBe("COMPTE_BLOQUE");
        expect(auditActions()).toEqual(
          expect.arrayContaining(["password.change_failed", "password.change_locked"]),
        );
        clock.advance(16 * 60_000);
        await change(again.token, {
          currentPassword: "Mangue2026",
          newPassword: "papaye et goyave",
        }).expect(200);
      });

      it("corps invalide : 400 (champ manquant ou inconnu)", async () => {
        const a = await connecte("corps-change@exemple.ga");
        await change(a.token, { newPassword: "papaye et goyave" }).expect(400);
        await change(a.token, {
          currentPassword: "Mangue2026",
          newPassword: "papaye et goyave",
          role: "ADMIN",
        }).expect(400);
      });
    });

    it("corps invalides : 400 (champ inconnu, code ou ticket mal formé)", async () => {
      await post("/api/v1/auth/password/forgot", { identifier: "a@b.ga", role: "x" }).expect(400);
      await post("/api/v1/auth/password/resend", { ticket: "court" }).expect(400);
      await post("/api/v1/auth/password/reset", {
        ticket: "a".repeat(43),
        code: "12ab56",
        newPassword: "Papaye2027",
      }).expect(400);
    });

    it("corps de connexion invalide : 400", async () => {
      await post("/api/v1/auth/login", { identifier: "a@b.ga" }).expect(400);
      await post("/api/v1/auth/login", {
        identifier: "a@b.ga",
        password: "x",
        role: "admin",
      }).expect(400);
    });
  });

  it("chaque code d'erreur du contrat a un statut HTTP", () => {
    expect(Object.keys(IDENTITY_ERROR_STATUS).sort()).toEqual([...IDENTITY_ERROR_CODES].sort());
  });
});
