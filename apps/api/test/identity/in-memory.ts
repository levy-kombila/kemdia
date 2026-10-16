import {
  IdentifierTakenError,
  type AccountRepository,
  type Clock,
  type OtpChallengeRepository,
  type OtpMessage,
  type LoginGuardRepository,
  type OtpSender,
  type PasswordResetChange,
  type ResetTicketRepository,
  type SecondFactorRecord,
  type SecondFactorRepository,
  type SessionRepository,
  type SignupTicketRepository,
  type GrantOutcome,
  type RoleRepository,
  type TransactionRunner,
} from "../../src/modules/identity/application/ports.js";
import type { AuditEntry } from "../../src/modules/audit/index.js";
import type { StoredRole } from "../../src/modules/identity/domain/role.js";
import {
  nextGuardState,
  type LoginGuardState,
} from "../../src/modules/identity/domain/login-guard.js";
import type { ResetTicket } from "../../src/modules/identity/domain/reset-ticket.js";
import type { Session } from "../../src/modules/identity/domain/session.js";
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
  /** Hachage factice : ne correspond à aucun mot de passe */
  dummyHash: "hash:\u0000factice",
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

/** BR-040 en mémoire : même règle (`nextGuardState`) que la requête SQL. */
export class InMemoryLoginGuards implements LoginGuardRepository {
  readonly rows = new Map<string, LoginGuardState>();
  claim(identifier: string, now: Date): Promise<LoginGuardState> {
    const next = nextGuardState(this.rows.get(identifier) ?? null, now);
    this.rows.set(identifier, next);
    return Promise.resolve({ ...next });
  }
  lock(identifier: string, until: Date): Promise<void> {
    const row = this.rows.get(identifier);
    if (row && (!row.lockedUntil || row.lockedUntil < until)) row.lockedUntil = until;
    return Promise.resolve();
  }
  reset(identifier: string, now: Date): Promise<void> {
    const row = this.rows.get(identifier);
    if (row && (!row.lockedUntil || row.lockedUntil <= now)) this.rows.delete(identifier);
    return Promise.resolve();
  }
}

export class InMemorySessions implements SessionRepository {
  rows: Session[] = [];
  create(session: Session): Promise<void> {
    this.rows.push({ ...session });
    return Promise.resolve();
  }
  findByTokenHash(tokenHash: string): Promise<Session | null> {
    const row = this.rows.find((s) => s.tokenHash === tokenHash);
    return Promise.resolve(row ? { ...row } : null);
  }
  renew(id: string, expiresAt: Date, lastSeenAt: Date): Promise<void> {
    const row = this.rows.find((s) => s.id === id && s.revokedAt === null);
    if (row) Object.assign(row, { expiresAt, lastSeenAt });
    return Promise.resolve();
  }
  revoke(id: string, now: Date): Promise<void> {
    const row = this.rows.find((s) => s.id === id && s.revokedAt === null);
    if (row) row.revokedAt = now;
    return Promise.resolve();
  }
  revokeAllForAccount(accountId: string, now: Date): Promise<number> {
    const rows = this.rows.filter(
      (s) => s.accountId === accountId && s.revokedAt === null && s.expiresAt > now,
    );
    rows.forEach((s) => (s.revokedAt = now));
    return Promise.resolve(rows.length);
  }
  confirmSecondFactor(id: string, now: Date): Promise<void> {
    const row = this.rows.find((s) => s.id === id && s.revokedAt === null);
    if (row) row.secondFactorAt = now;
    return Promise.resolve();
  }
}

/** Double authentification en mémoire (S6-T03) : mêmes règles que la base (période qui n'avance que, code utilisé une fois). */
export class InMemorySecondFactors implements SecondFactorRepository {
  rows = new Map<string, SecondFactorRecord>();
  codes: { accountId: string; hash: string; usedAt: Date | null }[] = [];
  find(accountId: string): Promise<SecondFactorRecord | null> {
    const row = this.rows.get(accountId);
    return Promise.resolve(row ? { ...row } : null);
  }
  lock(accountId: string): Promise<SecondFactorRecord | null> {
    return this.find(accountId);
  }
  savePending(accountId: string, secretBox: Uint8Array): Promise<boolean> {
    if (this.rows.get(accountId)?.enabledAt) return Promise.resolve(false);
    this.rows.set(accountId, { accountId, secretBox, enabledAt: null, lastUsedStep: null });
    return Promise.resolve(true);
  }
  enable(accountId: string, step: number, now: Date): Promise<boolean> {
    const row = this.rows.get(accountId);
    if (!row || row.enabledAt) return Promise.resolve(false);
    Object.assign(row, { enabledAt: now, lastUsedStep: step });
    return Promise.resolve(true);
  }
  useStep(accountId: string, step: number): Promise<boolean> {
    const row = this.rows.get(accountId);
    if (!row?.enabledAt || (row.lastUsedStep !== null && row.lastUsedStep >= step)) {
      return Promise.resolve(false);
    }
    row.lastUsedStep = step;
    return Promise.resolve(true);
  }
  replaceRecoveryCodes(accountId: string, hashes: readonly string[]): Promise<void> {
    this.codes = this.codes
      .filter((c) => c.accountId !== accountId)
      .concat(hashes.map((hash) => ({ accountId, hash, usedAt: null })));
    return Promise.resolve();
  }
  useRecoveryCode(accountId: string, hash: string, now: Date): Promise<boolean> {
    const code = this.codes.find(
      (c) => c.accountId === accountId && c.hash === hash && c.usedAt === null,
    );
    if (code) code.usedAt = now;
    return Promise.resolve(Boolean(code));
  }
  countUnusedRecoveryCodes(accountId: string): Promise<number> {
    return Promise.resolve(
      this.codes.filter((c) => c.accountId === accountId && c.usedAt === null).length,
    );
  }
  failures = new Map<string, { count: number; since: Date }>();
  recordFailure(accountId: string, now: Date, windowMs: number): Promise<number> {
    if (!this.rows.has(accountId)) return Promise.resolve(0);
    const current = this.failures.get(accountId);
    const next =
      !current || current.since.getTime() <= now.getTime() - windowMs
        ? { count: 1, since: now }
        : { count: current.count + 1, since: current.since };
    this.failures.set(accountId, next);
    return Promise.resolve(next.count);
  }
  remove(accountId: string): Promise<boolean> {
    this.codes = this.codes.filter((c) => c.accountId !== accountId);
    this.failures.delete(accountId);
    return Promise.resolve(this.rows.delete(accountId));
  }
}

export class InMemoryResetTickets implements ResetTicketRepository {
  rows: ResetTicket[] = [];
  constructor(
    private readonly accounts?: InMemoryAccounts,
    private readonly sessions?: InMemorySessions,
    private readonly guards?: InMemoryLoginGuards,
  ) {}
  replaceForDestination(ticket: ResetTicket): Promise<void> {
    this.rows = [...this.rows.filter((t) => t.destination !== ticket.destination), ticket];
    return Promise.resolve();
  }
  findByHash(ticketHash: string): Promise<ResetTicket | null> {
    return Promise.resolve(this.rows.find((t) => t.ticketHash === ticketHash) ?? null);
  }
  deleteForDestination(destination: string): Promise<void> {
    this.rows = this.rows.filter((t) => t.destination !== destination);
    return Promise.resolve();
  }
  /** Même effet que la transaction SQL ; tout se passe sans attente, donc sans entrelacement. */
  applyReset(change: PasswordResetChange): Promise<boolean> {
    if (!this.accounts || !this.sessions || !this.guards) throw new Error("dépôts manquants");
    const row = this.accounts.rows.get(change.accountId);
    if (!row || row.status !== "active" || row.passwordVersion !== change.expectedVersion)
      return Promise.resolve(false);
    this.accounts.rows.set(row.id, {
      ...row,
      passwordHash: change.passwordHash,
      passwordVersion: row.passwordVersion + 1,
    });
    this.rows = this.rows.filter((t) => t.destination !== change.destination);
    this.sessions.rows
      .filter((s) => s.accountId === change.accountId && s.revokedAt === null)
      .forEach((s) => (s.revokedAt = change.now));
    change.guardIdentifiers.forEach((id) => this.guards!.rows.delete(id));
    return Promise.resolve(true);
  }
}

/** Rôles en mémoire : modifient la ligne du compte (comme la table account_roles relue avec le compte). */
export class InMemoryRoles implements RoleRepository {
  constructor(private readonly accounts: InMemoryAccounts) {}
  grant(accountId: string, role: StoredRole): Promise<GrantOutcome> {
    const row = this.accounts.rows.get(accountId);
    if (!row) return Promise.resolve("missing");
    if (row.status !== "active") return Promise.resolve("inactive");
    if (row.roles.includes(role)) return Promise.resolve("unchanged");
    this.accounts.rows.set(accountId, { ...row, roles: [...row.roles, role] });
    return Promise.resolve("granted");
  }
  revoke(accountId: string, role: StoredRole): Promise<boolean> {
    const row = this.accounts.rows.get(accountId);
    if (!row?.roles.includes(role)) return Promise.resolve(false);
    this.accounts.rows.set(accountId, { ...row, roles: row.roles.filter((r) => r !== role) });
    return Promise.resolve(true);
  }
}

/** Journal d'audit qui garde les entrées pour que le test les lise. */
export class RecordingAudit {
  readonly entries: AuditEntry[] = [];
  record(entry: AuditEntry): Promise<void> {
    this.entries.push(entry);
    return Promise.resolve();
  }
  actions(): string[] {
    return this.entries.map((e) => e.action);
  }
}

/** Sans base : le travail s'exécute tel quel (les dépôts en mémoire n'ont pas de transaction). */
export const directTransactions: TransactionRunner = { run: (work) => work() };
