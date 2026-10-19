import { Inject, Injectable } from "@nestjs/common";
import { AuditLog, type AuditContext } from "../../audit/index.js";
import { requireIdentifier } from "../domain/identifier.js";
import { IdentityError } from "../domain/identity-error.js";
import { LOGIN_LOCK_MS, MAX_LOGIN_ATTEMPTS, isLocked } from "../domain/login-guard.js";
import { PASSWORD_MAX_LENGTH, assertStrongPassword } from "../domain/password-policy.js";
import { OtpService } from "./otp.service.js";
import {
  SessionService,
  type AuthenticatedSession,
  type OpenedSession,
} from "./session.service.js";
import {
  ACCOUNT_REPOSITORY,
  IDENTITY_CLOCK,
  LOGIN_GUARD_REPOSITORY,
  PASSWORD_HASHER,
  RESET_TICKET_REPOSITORY,
  SESSION_REPOSITORY,
  TRANSACTION_RUNNER,
  type AccountRepository,
  type Clock,
  type LoginGuardRepository,
  type PasswordHasher,
  type ResetTicketRepository,
  type SessionRepository,
  type TransactionRunner,
} from "./ports.js";

export interface PasswordChangeInput {
  session: AuthenticatedSession;
  currentPassword: string;
  newPassword: string;
  userAgent?: string;
  context: AuditContext;
}

const wrongPassword = () =>
  new IdentityError("MOT_DE_PASSE_INCORRECT", "mot de passe actuel incorrect");
const invalidSession = () => new IdentityError("SESSION_INVALIDE", "session expirée ou fermée");
function tooManyAttempts(lockedUntil: Date, now: Date): IdentityError {
  const seconds = Math.max(1, Math.ceil((lockedUntil.getTime() - now.getTime()) / 1000));
  return new IdentityError(
    "COMPTE_BLOQUE",
    `trop d'essais : réessayez dans ${Math.ceil(seconds / 60)} min`,
    seconds,
  );
}

/** Compteur d'essais propre au changement : un voleur de session ne peut pas bloquer la CONNEXION du titulaire. */
const guardKey = (accountId: string) => `password:${accountId.toLowerCase()}`;

/**
 * Changement du mot de passe depuis « Mon compte » (S7-T07, OWASP ASVS 5.0 V6.2.2 et V6.2.3).
 *
 * - Il faut le mot de passe ACTUEL : une session volée seule ne suffit pas à prendre le compte.
 * - 3 mots de passe actuels faux en 15 minutes : blocage de 15 minutes et SESSION FERMÉE (comme la double
 *   authentification, ADR-0034) ; chaque échec est inscrit au journal d'audit.
 * - Réussite, en UNE transaction : nouveau mot de passe (version +1, verrou optimiste), toutes les sessions fermées
 *   (celle-ci comprise), journal d'audit. Puis une NOUVELLE session est ouverte sur cet appareil (V7.2.4) et un avis
 *   « mot de passe modifié » est envoyé au titulaire.
 */
@Injectable()
export class PasswordChangeService {
  constructor(
    @Inject(ACCOUNT_REPOSITORY) private readonly accounts: AccountRepository,
    @Inject(RESET_TICKET_REPOSITORY) private readonly passwords: ResetTicketRepository,
    @Inject(SESSION_REPOSITORY) private readonly sessionStore: SessionRepository,
    @Inject(LOGIN_GUARD_REPOSITORY) private readonly guards: LoginGuardRepository,
    @Inject(PASSWORD_HASHER) private readonly hasher: PasswordHasher,
    @Inject(IDENTITY_CLOCK) private readonly clock: Clock,
    private readonly sessions: SessionService,
    @Inject(AuditLog) private readonly audit: Pick<AuditLog, "record">,
    @Inject(TRANSACTION_RUNNER) private readonly transactions: TransactionRunner,
    @Inject(OtpService) private readonly notices: Pick<OtpService, "notifyPasswordChanged">,
  ) {}

  async change(input: PasswordChangeInput): Promise<OpenedSession> {
    const accountId = input.session.account.id;
    // Nouveau mot de passe vérifié AVANT l'actuel : un mot de passe trop faible ne coûte pas un essai
    assertStrongPassword(input.newPassword);

    // Essai réservé AVANT de regarder le mot de passe (des envois simultanés n'obtiennent pas plus de 3 essais)
    const now = this.clock.now();
    const guard = await this.guards.claim(guardKey(accountId), now);
    if (isLocked(guard, now) && guard.lockedUntil) throw tooManyAttempts(guard.lockedUntil, now);

    const account = await this.accounts.findById(accountId);
    if (!account || !account.isActive()) throw invalidSession();
    // Mot de passe trop long : forcément faux, inutile de le hacher (comme la connexion)
    const currentOk =
      input.currentPassword.length > 0 &&
      input.currentPassword.length <= PASSWORD_MAX_LENGTH &&
      (await this.hasher.verify(account.passwordHash, input.currentPassword));
    if (!currentOk) return this.fail(input, now, guard.attempts);

    await this.guards.reset(guardKey(accountId), now);
    const expectedVersion = account.passwordVersion;
    account.changePassword(await this.hasher.hash(input.newPassword));
    const { email, phone } = account.snapshot();
    const applied = await this.transactions.run(async () => {
      const done = await this.passwords.applyPasswordChange({
        accountId,
        sessionId: input.session.sessionId,
        expectedVersion,
        passwordHash: account.passwordHash,
        now,
      });
      if (done) {
        await this.audit.record({
          action: "password.changed",
          actor: { type: "account", id: accountId },
          target: { type: "account", id: accountId },
          details: {},
          context: input.context,
        });
      }
      return done;
    });
    // Changé entre-temps (autre appareil, mot de passe oublié) : la session présentée ne vaut plus rien
    if (!applied) throw invalidSession();

    const contact = email ?? phone;
    if (contact) this.notices.notifyPasswordChanged(requireIdentifier(contact));
    return this.sessions.open(account, input.userAgent);
  }

  /** Mot de passe actuel faux : journal ; au 3e essai, blocage de 15 minutes et session fermée. */
  private async fail(input: PasswordChangeInput, now: Date, attempts: number): Promise<never> {
    const accountId = input.session.account.id;
    const target = { type: "account" as const, id: accountId };
    const locked = attempts >= MAX_LOGIN_ATTEMPTS;
    await this.transactions.run(async () => {
      await this.audit.record({
        action: locked ? "password.change_locked" : "password.change_failed",
        actor: target,
        target,
        details: { attempts },
        context: input.context,
      });
      if (!locked) return;
      await this.guards.lock(guardKey(accountId), new Date(now.getTime() + LOGIN_LOCK_MS));
      await this.sessionStore.revoke(input.session.sessionId, now);
    });
    if (locked) throw tooManyAttempts(new Date(now.getTime() + LOGIN_LOCK_MS), now);
    throw wrongPassword();
  }
}
