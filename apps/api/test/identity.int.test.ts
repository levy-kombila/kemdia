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
    'TRUNCATE "identity"."sessions", "identity"."otp_challenges", "identity"."accounts"',
  );
});
afterAll(() => prisma.$disconnect());

describe("comptes (PostgreSQL)", () => {
  it("enregistre et relit un compte à l'identique", async () => {
    const account = register("awa@exemple.ga");
    account.markVerified(requireIdentifier("awa@exemple.ga"), T0);
    account.recordFailedLogin(T0);
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

  it("met à jour le blocage (BR-040)", async () => {
    const account = register("awa@exemple.ga");
    await accounts.save(account);
    for (let i = 0; i < 3; i++) account.recordFailedLogin(T0);
    await accounts.save(account);
    expect((await accounts.findById(account.id))?.isLocked(T0)).toBe(true);
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
    const codes = [111_111, 222_222];
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
    expect(await challenges.countSentSince(email.value, T0)).toBe(2);

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
