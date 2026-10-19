import { Inject, Injectable } from "@nestjs/common";
import { AuditLog, type AuditAction, type AuditContext } from "../../audit/index.js";
import type { Account } from "../domain/account.js";
import { IdentityError } from "../domain/identity-error.js";
import { LOGIN_LOCK_MS, MAX_LOGIN_ATTEMPTS, isLocked } from "../domain/login-guard.js";
import { PASSWORD_MAX_LENGTH } from "../domain/password-policy.js";
import type { AuthenticatedSession } from "./session.service.js";
import {
  ACCOUNT_REPOSITORY,
  IDENTITY_CLOCK,
  LOGIN_GUARD_REPOSITORY,
  PASSWORD_HASHER,
  SESSION_REPOSITORY,
  TRANSACTION_RUNNER,
  type AccountRepository,
  type Clock,
  type LoginGuardRepository,
  type PasswordHasher,
  type SessionRepository,
  type TransactionRunner,
} from "./ports.js";

/** Action sensible protégée par le mot de passe actuel ; chacune a son propre compteur d'essais. */
export type ConfirmedAction = "password-change" | "account-delete";

const SETTINGS: Record<
  ConfirmedAction,
  { prefix: string; failed: AuditAction; locked: AuditAction }
> = {
  "password-change": {
    prefix: "password",
    failed: "password.change_failed",
    locked: "password.change_locked",
  },
  "account-delete": {
    prefix: "delete",
    failed: "account.delete_failed",
    locked: "account.delete_locked",
  },
};

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

export interface ConfirmationInput {
  session: AuthenticatedSession;
  password: string;
  action: ConfirmedAction;
  context: AuditContext;
}

/**
 * Confirmation par le mot de passe ACTUEL avant une action sensible (S7-T07 changement du mot de passe, S7-T08
 * suppression du compte). Une session volée seule ne suffit pas.
 *
 * - Essai réservé AVANT de regarder le mot de passe (des envois simultanés n'obtiennent pas plus de 3 essais).
 * - Compteur propre à chaque action (`password:<id>`, `delete:<id>`) : un voleur de session ne bloque pas la CONNEXION
 *   du titulaire.
 * - 3 erreurs en 15 minutes : blocage de 15 minutes et SESSION FERMÉE ; chaque échec est inscrit au journal d'audit.
 * - La décision ne dépend QUE de la vérification Argon2id (CodeQL js/user-controlled-bypass).
 */
@Injectable()
export class PasswordConfirmationService {
  constructor(
    @Inject(ACCOUNT_REPOSITORY) private readonly accounts: AccountRepository,
    @Inject(SESSION_REPOSITORY) private readonly sessionStore: SessionRepository,
    @Inject(LOGIN_GUARD_REPOSITORY) private readonly guards: LoginGuardRepository,
    @Inject(PASSWORD_HASHER) private readonly hasher: PasswordHasher,
    @Inject(IDENTITY_CLOCK) private readonly clock: Clock,
    @Inject(AuditLog) private readonly audit: Pick<AuditLog, "record">,
    @Inject(TRANSACTION_RUNNER) private readonly transactions: TransactionRunner,
  ) {}

  /** Le compte, si le mot de passe est le bon ; sinon une erreur (et, au 3e essai, blocage et session fermée). */
  async confirm(input: ConfirmationInput): Promise<Account> {
    const accountId = input.session.account.id;
    const key = `${SETTINGS[input.action].prefix}:${accountId.toLowerCase()}`;
    const now = this.clock.now();
    const guard = await this.guards.claim(key, now);
    if (isLocked(guard, now) && guard.lockedUntil) throw tooManyAttempts(guard.lockedUntil, now);

    const account = await this.accounts.findById(accountId);
    if (!account || !account.isActive()) throw invalidSession();
    // Vide ou trop long : forcément faux, inutile de le hacher (comme la connexion) — c'est un essai perdu
    const length = input.password.length;
    if (length === 0 || length > PASSWORD_MAX_LENGTH)
      return this.fail(input, key, now, guard.attempts);
    if (!(await this.hasher.verify(account.passwordHash, input.password))) {
      return this.fail(input, key, now, guard.attempts);
    }
    await this.guards.reset(key, now);
    return account;
  }

  private async fail(
    input: ConfirmationInput,
    key: string,
    now: Date,
    attempts: number,
  ): Promise<never> {
    const target = { type: "account" as const, id: input.session.account.id };
    const locked = attempts >= MAX_LOGIN_ATTEMPTS;
    await this.transactions.run(async () => {
      await this.audit.record({
        action: locked ? SETTINGS[input.action].locked : SETTINGS[input.action].failed,
        actor: target,
        target,
        details: { attempts },
        context: input.context,
      });
      if (!locked) return;
      await this.guards.lock(key, new Date(now.getTime() + LOGIN_LOCK_MS));
      await this.sessionStore.revoke(input.session.sessionId, now);
    });
    if (locked) throw tooManyAttempts(new Date(now.getTime() + LOGIN_LOCK_MS), now);
    throw wrongPassword();
  }
}
