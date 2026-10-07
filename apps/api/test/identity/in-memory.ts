import {
  IdentifierTakenError,
  type AccountRepository,
  type Clock,
  type OtpChallengeRepository,
  type OtpMessage,
  type OtpSender,
} from "../../src/modules/identity/application/ports.js";
import { Account } from "../../src/modules/identity/domain/account.js";
import type { Identifier, OtpChannel } from "../../src/modules/identity/domain/identifier.js";
import { OtpChallenge, type OtpPurpose } from "../../src/modules/identity/domain/otp.js";

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
  readonly rows: ReturnType<OtpChallenge["snapshot"]>[] = [];

  create(challenge: OtpChallenge): Promise<void> {
    this.rows.push(challenge.snapshot());
    return Promise.resolve();
  }
  findLatest(destination: string, purpose: OtpPurpose): Promise<OtpChallenge | null> {
    const row = this.rows
      .filter((r) => r.destination === destination && r.purpose === purpose)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0];
    return Promise.resolve(row ? OtpChallenge.restore(row) : null);
  }
  lastSentAt(destination: string): Promise<Date | null> {
    const dates = this.rows
      .filter((r) => r.destination === destination)
      .map((r) => r.createdAt.getTime());
    return Promise.resolve(dates.length ? new Date(Math.max(...dates)) : null);
  }
  countSentSince(destination: string, since: Date): Promise<number> {
    return Promise.resolve(
      this.rows.filter((r) => r.destination === destination && r.createdAt >= since).length,
    );
  }
  save(challenge: OtpChallenge): Promise<void> {
    const snap = challenge.snapshot();
    const index = this.rows.findIndex((r) => r.id === snap.id);
    if (index >= 0) this.rows[index] = snap;
    return Promise.resolve();
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
    const last = this.sent.at(-1);
    if (!last) throw new Error("aucun code envoyé");
    return last.code;
  }
}

export class FakeClock implements Clock {
  constructor(public current = new Date("2026-10-07T10:00:00Z")) {}
  now(): Date {
    return new Date(this.current);
  }
  advance(ms: number): void {
    this.current = new Date(this.current.getTime() + ms);
  }
}
