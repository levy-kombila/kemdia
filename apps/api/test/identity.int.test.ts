import "reflect-metadata";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { loadConfig } from "../src/config/env.js";
import { PrismaService } from "../src/database/prisma.service.js";
import { OtpService } from "../src/modules/identity/application/otp.service.js";
import { IdentifierTakenError } from "../src/modules/identity/application/ports.js";
import { Account } from "../src/modules/identity/domain/account.js";
import { requireIdentifier } from "../src/modules/identity/domain/identifier.js";
import { OTP_RESEND_DELAY_MS } from "../src/modules/identity/domain/otp.js";
import { PrismaAccountRepository } from "../src/modules/identity/infrastructure/prisma-account.repository.js";
import { PrismaOtpChallengeRepository } from "../src/modules/identity/infrastructure/prisma-otp-challenge.repository.js";
import { PrismaSignupTicketRepository } from "../src/modules/identity/infrastructure/prisma-signup-ticket.repository.js";
import { SignupService } from "../src/modules/identity/application/signup.service.js";
import { LoginService } from "../src/modules/identity/application/login.service.js";
import { SessionService } from "../src/modules/identity/application/session.service.js";
import { LOGIN_LOCK_MS } from "../src/modules/identity/domain/login-guard.js";
import { PrismaIdentityMaintenance } from "../src/modules/identity/infrastructure/identity-maintenance.js";
import { PrismaLoginGuardRepository } from "../src/modules/identity/infrastructure/prisma-login-guard.repository.js";
import { PrismaSessionRepository } from "../src/modules/identity/infrastructure/prisma-session.repository.js";
import { fakeHasher } from "./identity/in-memory.js";
import { FakeClock, RecordingOtpSender } from "./identity/in-memory.js";
import { testDatabaseUrl } from "./integration-db.js";

/** Module identity sur une VRAIE base : correspondance des colonnes, unicité, contraintes SQL, compteurs d'envoi. */
const config = loadConfig({
  NODE_ENV: "test",
  LOG_LEVEL: "silent",
  DATABASE_URL: testDatabaseUrl(),
});
const prisma = new PrismaService(config);
const accounts = new PrismaAccountRepository(prisma);
const challenges = new PrismaOtpChallengeRepository(prisma);
const tickets = new PrismaSignupTicketRepository(prisma);
const sessions = new PrismaSessionRepository(prisma);
const guards = new PrismaLoginGuardRepository(prisma);
const maintenance = new PrismaIdentityMaintenance(prisma);

const T0 = new Date("2026-10-07T10:00:00.000Z");
let n = 0;
const uuid = () => `00000000-0000-4000-8000-${String(++n).padStart(12, "0")}`;

const register = (identifier: string, id = uuid()) =>
  Account.register({
    id,
    firstName: "Awa",
    lastName: "Ndong",
    identifier: requireIdentifier(identifier),
    passwordHash: "$argon2id$v=19$m=19456,t=2,p=1$c2Vs$aGFjaGFnZQ",
    now: T0,
  });

beforeEach(async () => {
  await prisma.$executeRawUnsafe(
    'TRUNCATE "identity"."login_guards", "identity"."sessions", "identity"."signup_tickets", "identity"."otp_challenges", "identity"."accounts"',
  );
});
afterAll(() => prisma.$disconnect());

describe("comptes (PostgreSQL)", () => {
  it("enregistre et relit un compte à l'identique", async () => {
    const account = register("awa@exemple.ga");
    account.markVerified(requireIdentifier("awa@exemple.ga"), T0);
    await accounts.save(account);

    const byEmail = await accounts.findByIdentifier(requireIdentifier("AWA@exemple.ga"));
    expect(byEmail?.snapshot()).toEqual(account.snapshot());
    expect((await accounts.findById(account.id))?.status).toBe("active");
    expect(await accounts.findByIdentifier(requireIdentifier("077123456"))).toBeNull();
  });

  it("un e-mail ou un téléphone ne sert qu'à un compte", async () => {
    await accounts.save(register("awa@exemple.ga"));
    await accounts.save(register("077123456"));
    await expect(accounts.save(register("awa@exemple.ga"))).rejects.toBeInstanceOf(
      IdentifierTakenError,
    );
    await expect(accounts.save(register("+241 77 12 34 56"))).rejects.toBeInstanceOf(
      IdentifierTakenError,
    );
  });

  it("la base refuse les données qui contourneraient le domaine", async () => {
    const insert = (values: string) =>
      prisma.$executeRawUnsafe(
        `INSERT INTO "identity"."accounts" ("id", "first_name", "last_name", "email", "phone", "password_hash", "status", "updated_at") VALUES (gen_random_uuid(), 'A', 'B', ${values}, now())`,
      );
    await expect(insert("NULL, NULL, 'h', 'PENDING'")).rejects.toThrow(/accounts_identifier_check/);
    await expect(insert("'Awa@exemple.ga', NULL, 'h', 'PENDING'")).rejects.toThrow(
      /accounts_email_check/,
    );
    await expect(insert("NULL, '+241011234567', 'h', 'PENDING'")).rejects.toThrow(
      /accounts_phone_check/,
    );
    // BR-041 : pas de compte actif sans identifiant vérifié
    await expect(insert("'awa@exemple.ga', NULL, 'h', 'ACTIVE'")).rejects.toThrow(
      /accounts_active_verified_check/,
    );
  });
});

describe("codes à usage unique (PostgreSQL)", () => {
  it("parcours complet : envoi, limites comptées en base, vérification", async () => {
    const clock = new FakeClock(T0);
    const sender = new RecordingOtpSender(["email"]);
    // Le 2ᵉ tirage sert à la demande refusée (code tiré avant la vérification des limites)
    const codes = [111_111, 999_999, 222_222];
    let i = 0;
    const service = new OtpService(
      challenges,
      sender,
      clock,
      { smsEnabled: false },
      {
        int: () => codes[i++] ?? 0,
        uuid,
      },
    );
    const email = requireIdentifier("awa@exemple.ga");

    await service.issue("signup", email);
    await expect(service.issue("signup", email)).rejects.toMatchObject({
      code: "ENVOI_TROP_RAPPROCHE",
    });
    clock.advance(OTP_RESEND_DELAY_MS);
    await service.issue("signup", email);
    expect(await prisma.otpChallenge.count()).toBe(2);

    // Seul le dernier code compte ; l'essai raté est enregistré
    await expect(service.verify("signup", email, "111111")).rejects.toMatchObject({
      code: "CODE_INVALIDE",
    });
    const rows = await prisma.otpChallenge.findMany({ orderBy: { createdAt: "asc" } });
    expect(rows.map((r) => r.attempts)).toEqual([0, 1]);
    expect(JSON.stringify(rows)).not.toMatch(/111111|222222/);

    await expect(service.verify("signup", email, "222222")).resolves.toBeUndefined();
    await expect(service.verify("signup", email, "222222")).rejects.toMatchObject({
      code: "CODE_EXPIRE",
    });
    // L'ancien code ne redevient pas valable une fois le nouveau utilisé
    await expect(service.verify("signup", email, "111111")).rejects.toMatchObject({
      code: "CODE_EXPIRE",
    });
  });
});

describe("codes : demandes simultanées (PostgreSQL)", () => {
  const email = requireIdentifier("awa@exemple.ga");
  const setup = () => {
    const clock = new FakeClock(T0);
    const sender = new RecordingOtpSender(["email"]);
    return {
      clock,
      sender,
      service: new OtpService(challenges, sender, clock, { smsEnabled: false }),
    };
  };
  const outcome = (p: Promise<unknown>) =>
    p.then(
      () => "ok",
      (e: { code?: string }) => e.code ?? "?",
    );

  it("20 essais simultanés : 5 comptés au plus, le bon code ensuite refusé", async () => {
    const { service, sender } = setup();
    await service.issue("signup", email);
    const wrong = sender.lastCode() === "000000" ? "111111" : "000000";
    const results = await Promise.all(
      Array.from({ length: 20 }, () => outcome(service.verify("signup", email, wrong))),
    );
    expect(results.filter((r) => r === "CODE_INVALIDE")).toHaveLength(4);
    expect(results.filter((r) => r === "TROP_D_ESSAIS")).toHaveLength(16);
    expect((await prisma.otpChallenge.findFirstOrThrow()).attempts).toBe(5);
    await expect(service.verify("signup", email, sender.lastCode())).rejects.toMatchObject({
      code: "TROP_D_ESSAIS",
    });
  });

  it("5 bons essais simultanés : un seul passe", async () => {
    const { service, sender } = setup();
    await service.issue("signup", email);
    const results = await Promise.all(
      Array.from({ length: 5 }, () => outcome(service.verify("signup", email, sender.lastCode()))),
    );
    expect(results.filter((r) => r === "ok")).toHaveLength(1);
  });

  it("10 demandes de code simultanées : une seule passe la limite de 60 s", async () => {
    const { service } = setup();
    const results = await Promise.all(
      Array.from({ length: 10 }, () => outcome(service.issue("signup", email))),
    );
    expect(results.filter((r) => r === "ok")).toHaveLength(1);
    expect(results.filter((r) => r === "ENVOI_TROP_RAPPROCHE")).toHaveLength(9);
    expect(await prisma.otpChallenge.count()).toBe(1);
  });
});

describe("inscription (PostgreSQL)", () => {
  const setup = () => {
    const clock = new FakeClock(T0);
    const sender = new RecordingOtpSender(["email"]);
    const otp = new OtpService(challenges, sender, clock, { smsEnabled: false });
    const sessionService = new SessionService(sessions, accounts, clock);
    return {
      clock,
      sender,
      service: new SignupService(accounts, tickets, fakeHasher, clock, otp, sessionService),
    };
  };
  const INPUT = {
    firstName: "Awa",
    lastName: "Ndong",
    identifier: "awa@exemple.ga",
    password: "Mangue2026",
  };

  it("parcours complet ; aucun compte avant le code ; le ticket n'est gardé que sous forme d'empreinte", async () => {
    const { service, sender } = setup();
    const { ticket } = await service.start(INPUT);
    expect(await prisma.account.count()).toBe(0);
    const rows = await prisma.signupTicket.findMany();
    expect(rows).toEqual([
      expect.objectContaining({
        firstName: "Awa",
        lastName: "Ndong",
        passwordHash: "hash:Mangue2026",
      }),
    ]);
    expect(JSON.stringify(rows)).not.toContain(ticket);

    await service.verify(ticket, sender.lastCode());
    const account = await accounts.findByIdentifier(requireIdentifier("awa@exemple.ga"));
    expect(account?.snapshot()).toMatchObject({
      status: "active",
      passwordHash: "hash:Mangue2026",
    });
    expect(await prisma.signupTicket.count()).toBe(0);
  });

  it("une seule inscription en cours par adresse", async () => {
    const { service, sender, clock } = setup();
    const first = await service.start(INPUT);
    clock.advance(OTP_RESEND_DELAY_MS);
    await service.start({ ...INPUT, firstName: "Intrus" });
    expect(await prisma.signupTicket.count()).toBe(1);
    await expect(service.verify(first.ticket, sender.lastCode())).rejects.toMatchObject({
      code: "CODE_EXPIRE",
    });
    expect(await prisma.account.count()).toBe(0);
  });

  it("compte existant : ticket leurre sans inscription, alerte envoyée, compte intact", async () => {
    const { service, sender, clock } = setup();
    const { ticket } = await service.start(INPUT);
    await service.verify(ticket, sender.lastCode());
    clock.advance(OTP_RESEND_DELAY_MS);
    await service.start({ ...INPUT, password: "Autre2026x" });
    const decoy = await prisma.signupTicket.findFirstOrThrow();
    expect(decoy).toMatchObject({ firstName: null, lastName: null, passwordHash: null });
    expect(sender.sent.at(-1)).toMatchObject({ kind: "signup-alert" });
    const account = await accounts.findByIdentifier(requireIdentifier("awa@exemple.ga"));
    expect(account?.passwordHash).toBe("hash:Mangue2026");
  });

  it("la base refuse un ticket à moitié rempli", async () => {
    await expect(
      prisma.$executeRawUnsafe(
        `INSERT INTO "identity"."signup_tickets" ("id", "ticket_hash", "destination", "first_name", "expires_at") VALUES (gen_random_uuid(), repeat('a', 64), 'a@b.ga', 'Awa', now() + interval '1 hour')`,
      ),
    ).rejects.toThrow(/signup_tickets_registration_check/);
  });
});

describe("connexion et sessions (PostgreSQL)", () => {
  const setup = async () => {
    const clock = new FakeClock(T0);
    const sessionService = new SessionService(sessions, accounts, clock);
    const account = register("awa@exemple.ga");
    account.markVerified(requireIdentifier("awa@exemple.ga"), T0);
    // fakeHasher : hash:<mot de passe>
    const props = account.snapshot();
    await accounts.save(Account.restore({ ...props, passwordHash: "hash:Mangue2026" }));
    const login = new LoginService(accounts, guards, fakeHasher, clock, sessionService);
    return { clock, sessionService, login };
  };
  const outcome = (p: Promise<unknown>) =>
    p.then(
      () => "ok",
      (e: { code?: string }) => e.code ?? "?",
    );

  it("connexion, session prolongée, déconnexion ; le jeton n'est gardé que sous forme d'empreinte", async () => {
    const { login, sessionService, clock } = await setup();
    const opened = await login.login({
      identifier: "awa@exemple.ga",
      password: "Mangue2026",
      userAgent: "Firefox",
    });
    const rows = await prisma.session.findMany();
    expect(rows).toHaveLength(1);
    expect(JSON.stringify(rows)).not.toContain(opened.token);
    clock.advance(2 * 60 * 60_000);
    const again = await sessionService.authenticate(opened.token);
    expect(again.expiresAt.getTime()).toBeGreaterThan(opened.expiresAt.getTime());
    await sessionService.logout(opened.token);
    await expect(sessionService.authenticate(opened.token)).rejects.toMatchObject({
      code: "SESSION_INVALIDE",
    });
  });

  it("30 essais simultanés avec de mauvais mots de passe : 3 mots de passe vérifiés au plus, puis blocage", async () => {
    const clock = new FakeClock(T0);
    const account = register("awa@exemple.ga");
    account.markVerified(requireIdentifier("awa@exemple.ga"), T0);
    await accounts.save(
      Account.restore({ ...account.snapshot(), passwordHash: "hash:Mangue2026" }),
    );
    let verified = 0;
    const counting = {
      ...fakeHasher,
      verify: (h: string, p: string) => (verified++, fakeHasher.verify(h, p)),
    };
    const login = new LoginService(
      accounts,
      guards,
      counting,
      clock,
      new SessionService(sessions, accounts, clock),
    );
    const results = await Promise.all(
      Array.from({ length: 30 }, (_, i) =>
        outcome(login.login({ identifier: "awa@exemple.ga", password: `faux${i}` })),
      ),
    );
    expect(verified).toBeLessThanOrEqual(3);
    expect(results.every((r) => r === "IDENTIFIANTS_INCORRECTS" || r === "COMPTE_BLOQUE")).toBe(
      true,
    );
    // Même le bon mot de passe attend 15 minutes
    await expect(
      login.login({ identifier: "awa@exemple.ga", password: "Mangue2026" }),
    ).rejects.toMatchObject({ code: "COMPTE_BLOQUE" });
    const guard = await prisma.loginGuard.findUniqueOrThrow({
      where: { identifier: "awa@exemple.ga" },
    });
    expect(guard.lockedUntil?.getTime()).toBe(T0.getTime() + LOGIN_LOCK_MS);
  });

  it("une réussite n'efface pas un blocage en cours ; les essais s'oublient après 15 minutes", async () => {
    await guards.claim("x@exemple.ga", T0);
    await guards.claim("x@exemple.ga", T0);
    const later = new Date(T0.getTime() + 15 * 60_000);
    expect((await guards.claim("x@exemple.ga", later)).attempts).toBe(1);
    for (let i = 0; i < 4; i++) await guards.claim("y@exemple.ga", T0);
    await guards.reset("y@exemple.ga", T0);
    expect(await prisma.loginGuard.count({ where: { identifier: "y@exemple.ga" } })).toBe(1);
  });

  it("adresse sans compte : bloquée pareil (rien ne révèle qui est client)", async () => {
    const { login } = await setup();
    const results = [];
    for (let i = 0; i < 4; i++) {
      results.push(
        await outcome(login.login({ identifier: "inconnu@exemple.ga", password: "Mangue2026" })),
      );
    }
    expect(results).toEqual([
      "IDENTIFIANTS_INCORRECTS",
      "IDENTIFIANTS_INCORRECTS",
      "COMPTE_BLOQUE",
      "COMPTE_BLOQUE",
    ]);
  });

  it("déconnecter tous les appareils", async () => {
    const { login, sessionService } = await setup();
    const a = await login.login({ identifier: "awa@exemple.ga", password: "Mangue2026" });
    const b = await login.login({ identifier: "awa@exemple.ga", password: "Mangue2026" });
    await expect(sessionService.logoutAll(a.account.id)).resolves.toBe(2);
    await expect(sessionService.authenticate(b.token)).rejects.toMatchObject({
      code: "SESSION_INVALIDE",
    });
  });

  it("ménage : supprime seulement ce qui est périmé", async () => {
    const { login, sessionService, clock } = await setup();
    const kept = await login.login({ identifier: "awa@exemple.ga", password: "Mangue2026" });
    const closed = await login.login({ identifier: "awa@exemple.ga", password: "Mangue2026" });
    await sessionService.logout(closed.token);
    await login.login({ identifier: "inconnu@exemple.ga", password: "x1" }).catch(() => undefined);
    const now = new Date(clock.now().getTime() + 2 * 24 * 60 * 60_000);
    const counts = await maintenance.purgeExpired(now);
    expect(counts).toMatchObject({ sessions: 1, compteurs: 1 });
    await expect(prisma.session.count()).resolves.toBe(1);
    expect((await prisma.session.findFirstOrThrow()).revokedAt).toBeNull();
    void kept;
  });
});
