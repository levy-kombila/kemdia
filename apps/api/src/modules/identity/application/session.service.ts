import { randomUUID } from "node:crypto";
import { Inject, Injectable } from "@nestjs/common";
import { AuditLog, NO_REQUEST, type AuditContext } from "../../audit/index.js";
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
  TRANSACTION_RUNNER,
  type AccountRepository,
  type Clock,
  type SessionRepository,
  type TransactionRunner,
} from "./ports.js";

export interface OpenedSession {
  /** Jeton à remettre au site (cookie HttpOnly) ; jamais enregistré tel quel */
  token: string;
  expiresAt: Date;
  account: AccountView;
}

export interface AuthenticatedSession {
  sessionId: string;
  /** Ouverture de la session (connexion) : les routes d'administration exigent moins de 15 minutes (ADR-0020) */
  openedAt: Date;
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
    @Inject(AuditLog) private readonly audit: Pick<AuditLog, "record">,
    @Inject(TRANSACTION_RUNNER) private readonly transactions: TransactionRunner,
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
      // Version du mot de passe LUE avec le hachage vérifié : une connexion commencée avant
      // un changement de mot de passe donne une session aussitôt refusée (ADR-0018)
      passwordVersion: account.passwordVersion,
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
    if (session.passwordVersion !== account.passwordVersion) throw invalidSession();

    let expiresAt = session.expiresAt;
    if (shouldRenew(session, now)) {
      expiresAt = new Date(now.getTime() + SESSION_TTL_MS);
      await this.sessions.renew(session.id, expiresAt, now);
    }
    return {
      sessionId: session.id,
      openedAt: session.createdAt,
      expiresAt,
      account: account.view(),
    };
  }

  /** Déconnexion : la session ne vaut plus rien, tout de suite. Sans effet sur un jeton inconnu. */
  async logout(token: string): Promise<void> {
    if (!SECRET_PATTERN.test(token)) return;
    const session = await this.sessions.findByTokenHash(hashSecret(token));
    if (session && session.revokedAt === null)
      await this.sessions.revoke(session.id, this.clock.now());
  }

  /**
   * « Déconnecter tous mes appareils », inscrit au journal d'audit dans la même transaction (S4-T06).
   * (Après un changement de mot de passe : voir ResetTicketRepository.applyReset.)
   */
  logoutAll(accountId: string, context: AuditContext = NO_REQUEST): Promise<number> {
    return this.transactions.run(async () => {
      const count = await this.sessions.revokeAllForAccount(accountId, this.clock.now());
      await this.audit.record({
        action: "sessions.revoked_all",
        actor: { type: "account", id: accountId },
        target: { type: "account", id: accountId },
        details: { count },
        context,
      });
      return count;
    });
  }
}
