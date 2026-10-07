import {
  IdentifierTakenError,
  type AccountRepository,
  type Clock,
  type OtpChallengeRepository,
  type OtpMessage,
  type OtpSender,
  type SignupTicketRepository,
} from "../../src/modules/identity/application/ports.js";
import type { SignupTicket } from "../../src/modules/identity/domain/signup-ticket.js";
import { Account } from "../../src/modules/identity/domain/account.js";
import type { Identifier, OtpChannel } from "../../src/modules/identity/domain/identifier.js";
import {
  OtpChallenge,
  type OtpChallengeProps,
  type OtpPurpose,
} from "../../src/modules/identity/domain/otp.js";

/** Doubles en mémoire du module identity (le vrai SQL est testé en intégration). */
export class InMemoryAccounts implements AccountRepository {
  readonly rows = new Map<string, ReturnType<Account["snapshot"]>>();

  findById(id: string): Promise<Account | null> {
    const row = this.rows.get(id);
    return Promise.resolve(row ? Account.restore(row) : null);
  }
  findByIdentifier(identifier: Identifier): Promise<Account | null> {
    const key = identifier.kind === "email" ? "email" : "phone";
    const row = [...this.rows.values()].find((r) => r[key] === identifier.value);
    return Promise.resolve(row ? Account.restore(row) : null);
  }
  save(account: Account): Promise<void> {
    const snap = account.snapshot();
    const clash = [...this.rows.values()].some(
      (r) =>
        r.id !== snap.id &&
        ((snap.email !== null && r.email === snap.email) ||
          (snap.phone !== null && r.phone === snap.phone)),
    );
    if (clash) return Promise.reject(new IdentifierTakenError());
    this.rows.set(snap.id, snap);
    return Promise.resolve();
  }
}

export class InMemoryOtpChallenges implements OtpChallengeRepository {
  readonly rows: OtpChallengeProps[] = [];

  createWithinLimits(challenge: OtpChallenge, check: (sent: Date[]) => void): Promise<void> {
    const s = challenge.snapshot();
    const since = s.createdAt.getTime() - 60 * 60_000;
    try {
      check(
        this.rows
          .filter((r) => r.destination === s.destination && r.purpose === s.purpose)
          .filter((r) => r.createdAt.getTime() > since)
          .map((r) => r.createdAt),
      );
    } catch (error) {
      return Promise.reject(error instanceof Error ? error : new Error(String(error)));
    }
    this.rows.push({ ...s });
    return Promise.resolve();
  }
  findLatest(destination: string, purpose: OtpPurpose): Promise<OtpChallenge | null> {
    const row = this.rows
      .filter((r) => r.destination === destination && r.purpose === purpose)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0];
    return Promise.resolve(row ? OtpChallenge.restore(row) : null);
  }
  claimAttempt(id: string, now: Date): Promise<number | null> {
    const row = this.rows.find((r) => r.id === id);
    if (!row || row.attempts >= 5 || row.consumedAt !== null || row.expiresAt <= now) {
      return Promise.resolve(null);
    }
    row.attempts += 1;
    return Promise.resolve(row.attempts);
  }
  consume(id: string, now: Date): Promise<boolean> {
    const row = this.rows.find((r) => r.id === id);
    if (!row || row.consumedAt !== null) return Promise.resolve(false);
    row.consumedAt = now;
    return Promise.resolve(true);
  }
}

/** Garde les messages « envoyés » pour que le test lise le code. */
export class RecordingOtpSender implements OtpSender {
  readonly sent: OtpMessage[] = [];
  constructor(readonly channels: readonly OtpChannel[] = ["email", "sms"]) {}
  send(message: OtpMessage): Promise<void> {
    this.sent.push(message);
    return Promise.resolve();
  }
  lastCode(): string {
    const last = this.sent.findLast((m) => m.kind === "code");
    if (last?.kind !== "code") throw new Error("aucun code envoyé");
    return last.code;
  }
}

export class InMemorySignupTickets implements SignupTicketRepository {
  rows: SignupTicket[] = [];
  replaceForDestination(ticket: SignupTicket): Promise<void> {
    this.rows = [...this.rows.filter((t) => t.destination !== ticket.destination), ticket];
    return Promise.resolve();
  }
  findByHash(ticketHash: string): Promise<SignupTicket | null> {
    return Promise.resolve(this.rows.find((t) => t.ticketHash === ticketHash) ?? null);
  }
  deleteForDestination(destination: string): Promise<void> {
    this.rows = this.rows.filter((t) => t.destination !== destination);
    return Promise.resolve();
  }
}

/** Faux hachage, instantané et lisible dans les tests (le vrai Argon2id a ses propres tests). */
export const fakeHasher = {
  hash: (password: string) => Promise.resolve(`hash:${password}`),
  verify: (hash: string, password: string) => Promise.resolve(hash === `hash:${password}`),
};

export class FakeClock implements Clock {
  constructor(public current = new Date("2026-10-07T10:00:00Z")) {}
  now(): Date {
    return new Date(this.current);
  }
  advance(ms: number): void {
    this.current = new Date(this.current.getTime() + ms);
  }
}
