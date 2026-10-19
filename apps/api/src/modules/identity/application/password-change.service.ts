import { Inject, Injectable } from "@nestjs/common";
import { AuditLog, type AuditContext } from "../../audit/index.js";
import { requireIdentifier } from "../domain/identifier.js";
import { IdentityError } from "../domain/identity-error.js";
import { assertStrongPassword } from "../domain/password-policy.js";
import { OtpService } from "./otp.service.js";
import { PasswordConfirmationService } from "./password-confirmation.service.js";
import {
  SessionService,
  type AuthenticatedSession,
  type OpenedSession,
} from "./session.service.js";
import {
  IDENTITY_CLOCK,
  PASSWORD_HASHER,
  RESET_TICKET_REPOSITORY,
  TRANSACTION_RUNNER,
  type Clock,
  type PasswordHasher,
  type ResetTicketRepository,
  type TransactionRunner,
} from "./ports.js";

export interface PasswordChangeInput {
  session: AuthenticatedSession;
  currentPassword: string;
  newPassword: string;
  userAgent?: string;
  context: AuditContext;
}

const invalidSession = () => new IdentityError("SESSION_INVALIDE", "session expirée ou fermée");

/**
 * Changement du mot de passe depuis « Mon compte » (S7-T07, OWASP ASVS 5.0 V6.2.2 et V6.2.3).
 *
 * - Il faut le mot de passe ACTUEL (`PasswordConfirmationService` : 3 erreurs → blocage 15 min et session fermée).
 * - Réussite, en UNE transaction : nouveau mot de passe (version +1, verrou optimiste), toutes les sessions fermées
 *   (celle-ci comprise), journal d'audit. Puis une NOUVELLE session est ouverte sur cet appareil (V7.2.4) et un avis
 *   « mot de passe modifié » est envoyé au titulaire.
 */
@Injectable()
export class PasswordChangeService {
  constructor(
    @Inject(RESET_TICKET_REPOSITORY) private readonly passwords: ResetTicketRepository,
    @Inject(PASSWORD_HASHER) private readonly hasher: PasswordHasher,
    @Inject(IDENTITY_CLOCK) private readonly clock: Clock,
    private readonly confirmation: PasswordConfirmationService,
    private readonly sessions: SessionService,
    @Inject(AuditLog) private readonly audit: Pick<AuditLog, "record">,
    @Inject(TRANSACTION_RUNNER) private readonly transactions: TransactionRunner,
    @Inject(OtpService) private readonly notices: Pick<OtpService, "notifyPasswordChanged">,
  ) {}

  async change(input: PasswordChangeInput): Promise<OpenedSession> {
    const accountId = input.session.account.id;
    // Nouveau mot de passe vérifié AVANT l'actuel : un mot de passe trop faible ne coûte pas un essai
    assertStrongPassword(input.newPassword);
    const account = await this.confirmation.confirm({
      session: input.session,
      password: input.currentPassword,
      action: "password-change",
      context: input.context,
    });

    const now = this.clock.now();
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
}
