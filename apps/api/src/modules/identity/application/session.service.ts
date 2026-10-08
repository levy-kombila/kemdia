import { randomUUID } from "node:crypto";
import { Inject, Injectable } from "@nestjs/common";
import type { Account, AccountView } from "../domain/account.js";
import { IdentityError } from "../domain/identity-error.js";
import { SECRET_PATTERN, generateSecret, hashSecret } from "../domain/secret.js";
import {
  SESSION_TTL_MS,
  isSessionActive,
  shouldRenew,
  summarizeUserAgent,
} from "../domain/session.js";
import {
  ACCOUNT_REPOSITORY,
  IDENTITY_CLOCK,
  SESSION_REPOSITORY,
  type AccountRepository,
  type Clock,
  type SessionRepository,
} from "./ports.js";

export interface OpenedSession {
  /** Jeton à remettre au site (cookie HttpOnly) ; jamais enregistré tel quel */
  token: string;
  expiresAt: Date;
  account: AccountView;
}

export interface AuthenticatedSession {
  sessionId: string;
  expiresAt: Date;
  account: AccountView;
}

const invalidSession = () =>
  new IdentityError("SESSION_INVALIDE", "session expirée ou fermée : reconnectez-vous");

/** Sessions (ADR-0015, ADR-0017) : 30 jours glissants, jeton haché, révocation immédiate. */
@Injectable()
export class SessionService {
  constructor(
    @Inject(SESSION_REPOSITORY) private readonly sessions: SessionRepository,
    @Inject(ACCOUNT_REPOSITORY) private readonly accounts: AccountRepository,
    @Inject(IDENTITY_CLOCK) private readonly clock: Clock,
  ) {}

  async open(account: Account, userAgent?: string): Promise<OpenedSession> {
    const now = this.clock.now();
    const token = generateSecret();
    const expiresAt = new Date(now.getTime() + SESSION_TTL_MS);
    await this.sessions.create({
      id: randomUUID(),
      accountId: account.id,
      tokenHash: hashSecret(token),
      expiresAt,
      lastSeenAt: now,
      revokedAt: null,
      userAgent: summarizeUserAgent(userAgent),
      createdAt: now,
    });
    return { token, expiresAt, account: account.view() };
  }

  /** Vérifie un jeton ; prolonge la session (au plus une fois par heure). */
  async authenticate(token: string): Promise<AuthenticatedSession> {
    if (!SECRET_PATTERN.test(token)) throw invalidSession();
    const now = this.clock.now();
    const session = await this.sessions.findByTokenHash(hashSecret(token));
    if (!session || !isSessionActive(session, now)) throw invalidSession();
    const account = await this.accounts.findById(session.accountId);
    if (!account || !account.isActive()) throw invalidSession();

    let expiresAt = session.expiresAt;
    if (shouldRenew(session, now)) {
      expiresAt = new Date(now.getTime() + SESSION_TTL_MS);
      await this.sessions.renew(session.id, expiresAt, now);
    }
    return { sessionId: session.id, expiresAt, account: account.view() };
  }

  /** Déconnexion : la session ne vaut plus rien, tout de suite. Sans effet sur un jeton inconnu. */
  async logout(token: string): Promise<void> {
    if (!SECRET_PATTERN.test(token)) return;
    const session = await this.sessions.findByTokenHash(hashSecret(token));
    if (session && session.revokedAt === null)
      await this.sessions.revoke(session.id, this.clock.now());
  }

  /** « Déconnecter tous mes appareils » (et, au S4-T04, après un changement de mot de passe). */
  logoutAll(accountId: string): Promise<number> {
    return this.sessions.revokeAllForAccount(accountId, this.clock.now());
  }
}
