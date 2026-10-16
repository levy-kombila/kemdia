import { Inject, Injectable } from "@nestjs/common";
import { AuditLog, NO_REQUEST, type AuditContext } from "../../audit/index.js";
import type { AccountView } from "../domain/account.js";
import { requireIdentifier } from "../domain/identifier.js";
import { IdentityError } from "../domain/identity-error.js";
import { LOGIN_LOCK_MS, MAX_LOGIN_ATTEMPTS, isLocked } from "../domain/login-guard.js";
import { PASSWORD_MAX_LENGTH } from "../domain/password-policy.js";
import { randomBytes } from "node:crypto";
import {
  DAILY_MAX_FAILURES,
  FAILURE_WINDOW_MS,
  RECOVERY_CODE_COUNT,
  generateRecoveryCode,
  hashRecoveryCode,
  isSecondFactorRecent,
  normalizeRecoveryCode,
  requiresSecondFactor,
  secondFactorExpiry,
} from "../domain/second-factor.js";
import {
  TOTP_CODE_PATTERN,
  base32Encode,
  generateTotpSecret,
  otpauthUri,
  verifyTotp,
} from "../domain/totp.js";
import { OtpService } from "./otp.service.js";
import type { AuthenticatedSession } from "./session.service.js";
import {
  ACCOUNT_REPOSITORY,
  IDENTITY_CLOCK,
  LOGIN_GUARD_REPOSITORY,
  PASSWORD_HASHER,
  SECOND_FACTOR_REPOSITORY,
  SECRET_BOX,
  SESSION_REPOSITORY,
  TRANSACTION_RUNNER,
  type AccountRepository,
  type Clock,
  type LoginGuardRepository,
  type PasswordHasher,
  type SecondFactorEvent,
  type SecondFactorRecord,
  type SecondFactorRepository,
  type SecretBox,
  type SessionRepository,
  type TransactionRunner,
} from "./ports.js";

export interface SecondFactorStatus {
  enabled: boolean;
  required: boolean;
  /** Fin de la confirmation de cette session, ou `null` (non confirmée ou confirmation dépassée) */
  verifiedUntil: Date | null;
  recoveryCodesLeft: number;
}

export interface SecondFactorSetup {
  /** Secret en base32, à taper à la main si le QR code ne passe pas */
  secret: string;
  otpauthUri: string;
}

const invalidCode = () =>
  new IdentityError("CODE_INVALIDE", "code incorrect : vérifiez l'heure de votre téléphone");
const wrongPassword = () => new IdentityError("MOT_DE_PASSE_INCORRECT", "mot de passe incorrect");
const unavailable = () =>
  new IdentityError(
    "DEUX_FACTEURS_INDISPONIBLE",
    "la double authentification n'est pas disponible sur ce serveur : prévenez l'exploitant",
  );

function tooManyAttempts(lockedUntil: Date, now: Date): IdentityError {
  const seconds = Math.max(1, Math.ceil((lockedUntil.getTime() - now.getTime()) / 1000));
  return new IdentityError(
    "TROP_D_ESSAIS",
    `trop d'essais incorrects : cette session est fermée ; reconnectez-vous dans ${Math.ceil(seconds / 60)} min`,
    seconds,
  );
}

/** Clé du compteur d'essais (table des blocages de connexion) : jamais un identifiant de connexion. */
const guardKey = (accountId: string) => `2fa:${accountId.toLowerCase()}`;

/**
 * Double authentification de l'équipe (MED-15, S6-T03, ADR-0034).
 *
 * 1. `setup` : un modérateur ou un administrateur redonne son MOT DE PASSE et reçoit un secret (QR code) — une
 *    session volée seule ne suffit pas pour inscrire le téléphone de l'attaquant ;
 * 2. `enable` : il donne le premier code de son application → 2FA activée, 10 codes de secours donnés UNE fois,
 *    session confirmée ;
 * 3. `verify` : avant une route d'équipe, il confirme sa session par un code (ou un code de secours), pour 15 minutes.
 *
 * Chaque mot de passe ou code faux compte : au 3e échec, la SESSION EST FERMÉE (il faut se reconnecter, donc repasser
 * par le mot de passe et ses propres limites, BR-040) et les codes sont bloqués 15 minutes. Le titulaire reçoit un avis
 * de sécurité à chaque activation, nouveaux codes de secours, blocage ou remise à zéro.
 */
@Injectable()
export class SecondFactorService {
  constructor(
    @Inject(SECOND_FACTOR_REPOSITORY) private readonly factors: SecondFactorRepository,
    @Inject(SESSION_REPOSITORY) private readonly sessions: SessionRepository,
    @Inject(ACCOUNT_REPOSITORY) private readonly accounts: AccountRepository,
    @Inject(LOGIN_GUARD_REPOSITORY) private readonly guards: LoginGuardRepository,
    @Inject(PASSWORD_HASHER) private readonly hasher: PasswordHasher,
    @Inject(SECRET_BOX) private readonly box: SecretBox,
    @Inject(IDENTITY_CLOCK) private readonly clock: Clock,
    @Inject(AuditLog) private readonly audit: Pick<AuditLog, "record">,
    @Inject(TRANSACTION_RUNNER) private readonly transactions: TransactionRunner,
    @Inject(OtpService) private readonly notices: Pick<OtpService, "notifySecondFactor">,
  ) {}

  async status(session: AuthenticatedSession): Promise<SecondFactorStatus> {
    const accountId = session.account.id;
    const record = await this.factors.find(accountId);
    const enabled = Boolean(record?.enabledAt);
    const now = this.clock.now();
    return {
      enabled,
      required: requiresSecondFactor(session.account.roles),
      verifiedUntil:
        enabled && session.secondFactorAt && isSecondFactorRecent(session.secondFactorAt, now)
          ? secondFactorExpiry(session.secondFactorAt)
          : null,
      recoveryCodesLeft: enabled ? await this.factors.countUnusedRecoveryCodes(accountId) : 0,
    };
  }

  /**
   * Nouveau secret à scanner, contre le mot de passe du compte. Refait autant de fois que voulu tant que la 2FA n'est
   * pas activée (le secret précédent ne sert plus).
   */
  async setup(
    session: AuthenticatedSession,
    password: string,
    context: AuditContext,
  ): Promise<SecondFactorSetup> {
    this.requireStaff(session);
    if (!this.box.available) throw unavailable();
    const accountId = session.account.id;
    // Déjà activée : refus AVANT de regarder le mot de passe (sinon la réponse dirait s'il est juste — relecture S6-T03)
    if ((await this.factors.find(accountId))?.enabledAt) throw alreadyEnabled();
    const { now, attempts } = await this.claimAttempt(accountId);
    const account = await this.accounts.findById(accountId);
    // Mot de passe trop long : forcément faux, inutile de le hacher (comme la connexion)
    const passwordOk =
      account !== null &&
      password.length > 0 &&
      password.length <= PASSWORD_MAX_LENGTH &&
      (await this.hasher.verify(account.passwordHash, password));
    if (!passwordOk) return this.failAttempt(session, now, attempts, context, wrongPassword);
    const secret = generateTotpSecret();
    const saved = await this.factors.savePending(accountId, this.box.seal(secret, accountId), now);
    if (!saved) throw alreadyEnabled();
    // Mot de passe juste et secret enregistré : les essais repartent de zéro pour le premier code
    // (une 2FA déjà activée ne passe jamais ici : un attaquant ne peut pas s'en servir pour remettre le compteur à zéro)
    await this.guards.reset(guardKey(accountId), now);
    // Avis au titulaire : un QR code vient d'être affiché (une inscription par quelqu'un d'autre se voit tout de suite)
    this.notify(session.account, "setup");
    const label = session.account.email ?? session.account.phone ?? accountId;
    return { secret: base32Encode(secret), otpauthUri: otpauthUri(secret, label) };
  }

  /** Premier code : active la 2FA, confirme la session et renvoie les 10 codes de secours (une seule fois). */
  async enable(
    session: AuthenticatedSession,
    code: string,
    context: AuditContext,
  ): Promise<{ recoveryCodes: string[]; verifiedUntil: Date }> {
    this.requireStaff(session);
    if (!this.box.available) throw unavailable();
    const accountId = session.account.id;
    const { now, attempts } = await this.claimAttempt(accountId);
    const codes = Array.from({ length: RECOVERY_CODE_COUNT }, generateRecoveryCode);
    const outcome = await this.transactions.run(async () => {
      const record = await this.factors.lock(accountId);
      if (!record) {
        throw new IdentityError(
          "DEUX_FACTEURS_A_CONFIGURER",
          "commencez par afficher le QR code de la double authentification",
        );
      }
      if (record.enabledAt) throw alreadyEnabled();
      const step = verifyTotp(this.secretOf(record), code, now, null);
      if (step === null) return "wrong" as const;
      await this.factors.enable(accountId, step, now);
      await this.factors.replaceRecoveryCodes(
        accountId,
        codes.map((c) => hashRecoveryCode(accountId, c)),
        now,
      );
      await this.sessions.confirmSecondFactor(session.sessionId, now);
      await this.audit.record({
        action: "mfa.enabled",
        actor: { type: "account", id: accountId },
        target: { type: "account", id: accountId },
        details: {},
        context,
      });
      return "ok" as const;
    });
    if (outcome === "wrong") return this.failAttempt(session, now, attempts, context, invalidCode);
    await this.guards.reset(guardKey(accountId), now);
    this.notify(session.account, "enabled");
    return { recoveryCodes: codes, verifiedUntil: secondFactorExpiry(now) };
  }

  /** Confirme la session pour 15 minutes : code de l'application (6 chiffres) ou code de secours. */
  async verify(
    session: AuthenticatedSession,
    code: string,
    context: AuditContext,
  ): Promise<{ verifiedUntil: Date; recoveryCodesLeft: number }> {
    if (!this.box.available) throw unavailable();
    const accountId = session.account.id;
    const { now, attempts } = await this.claimAttempt(accountId);
    let recoveryUsed = false;
    const outcome = await this.transactions.run(async () => {
      const record = await this.factors.lock(accountId);
      if (!record?.enabledAt) throw notEnabled();
      let ok: boolean;
      if (TOTP_CODE_PATTERN.test(code)) {
        ok = await this.useTotp(record, code, now);
      } else {
        const recovery = normalizeRecoveryCode(code);
        ok =
          recovery !== null &&
          (await this.factors.useRecoveryCode(
            accountId,
            hashRecoveryCode(accountId, recovery),
            now,
          ));
        if (ok) {
          recoveryUsed = true;
          await this.audit.record({
            action: "mfa.recovery_used",
            actor: { type: "account", id: accountId },
            target: { type: "account", id: accountId },
            details: { remaining: await this.factors.countUnusedRecoveryCodes(accountId) },
            context,
          });
        }
      }
      if (!ok) return "wrong" as const;
      await this.sessions.confirmSecondFactor(session.sessionId, now);
      return "ok" as const;
    });
    if (outcome === "wrong") return this.failAttempt(session, now, attempts, context, invalidCode);
    await this.guards.reset(guardKey(accountId), now);
    // Un code de secours volé (sur papier) se voit : avis au titulaire (relecture S6-T03)
    if (recoveryUsed) this.notify(session.account, "recovery-used");
    return {
      verifiedUntil: secondFactorExpiry(now),
      recoveryCodesLeft: await this.factors.countUnusedRecoveryCodes(accountId),
    };
  }

  /**
   * Nouveaux codes de secours (les anciens ne servent plus), contre un code FRAIS de l'application : une session
   * confirmée une fois (par un code volé ou un code de secours) ne suffit pas à se fabriquer un accès durable.
   */
  async regenerateRecoveryCodes(
    session: AuthenticatedSession,
    code: string,
    context: AuditContext,
  ): Promise<string[]> {
    if (!this.box.available) throw unavailable();
    const accountId = session.account.id;
    const { now, attempts } = await this.claimAttempt(accountId);
    const codes = Array.from({ length: RECOVERY_CODE_COUNT }, generateRecoveryCode);
    const outcome = await this.transactions.run(async () => {
      const record = await this.factors.lock(accountId);
      if (!record?.enabledAt) throw notEnabled();
      if (!TOTP_CODE_PATTERN.test(code) || !(await this.useTotp(record, code, now))) {
        return "wrong" as const;
      }
      await this.factors.replaceRecoveryCodes(
        accountId,
        codes.map((c) => hashRecoveryCode(accountId, c)),
        now,
      );
      await this.sessions.confirmSecondFactor(session.sessionId, now);
      await this.audit.record({
        action: "mfa.recovery_regenerated",
        actor: { type: "account", id: accountId },
        target: { type: "account", id: accountId },
        details: {},
        context,
      });
      return "ok" as const;
    });
    if (outcome === "wrong") return this.failAttempt(session, now, attempts, context, invalidCode);
    await this.guards.reset(guardKey(accountId), now);
    this.notify(session.account, "recovery-regenerated");
    return codes;
  }

  /**
   * Commande serveur (téléphone ET codes de secours perdus — ou volés) : supprime la 2FA du compte, FERME toutes ses
   * sessions et rend le MOT DE PASSE inutilisable (relecture de sécurité S6-T03) : un voleur qui connaîtrait aussi le
   * mot de passe ne peut pas se reconnecter pour inscrire son téléphone. Le titulaire passe par « Mot de passe
   * oublié » (sa boîte e-mail), se reconnecte et réactive la 2FA. Journal (« system ») et avis de sécurité.
   */
  async resetFromServer(rawIdentifier: string): Promise<{ accountId: string; changed: boolean }> {
    const account = await this.accounts.findByIdentifier(requireIdentifier(rawIdentifier));
    if (!account) throw new IdentityError("COMPTE_INTROUVABLE", "aucun compte ne correspond");
    const now = this.clock.now();
    if (!(await this.factors.find(account.id))) return { accountId: account.id, changed: false };
    // Mot de passe tiré au hasard et jamais montré : la version change, toute session ouverte avec l'ancien tombe
    account.changePassword(await this.hasher.hash(randomBytes(32).toString("base64url")));
    await this.accounts.save(account);
    const changed = await this.transactions.run(async () => {
      const removed = await this.factors.remove(account.id);
      if (!removed) return false;
      const closed = await this.sessions.revokeAllForAccount(account.id, now);
      await this.audit.record({
        action: "mfa.reset",
        actor: { type: "system" },
        target: { type: "account", id: account.id },
        details: { source: "server", sessionsClosed: closed, password: "inutilisable" },
        context: NO_REQUEST,
      });
      return true;
    });
    if (changed) this.notify(account.view(), "reset");
    return { accountId: account.id, changed };
  }

  private requireStaff(session: AuthenticatedSession): void {
    if (!requiresSecondFactor(session.account.roles)) {
      throw new IdentityError(
        "ACCES_REFUSE",
        "la double authentification est réservée à l'équipe (modérateurs et administrateurs)",
      );
    }
  }

  private secretOf(record: SecondFactorRecord): Uint8Array {
    return this.box.open(record.secretBox, record.accountId);
  }

  /** Code de l'application valable et jamais utilisé : la période est enregistrée (un code ne sert qu'une fois). */
  private async useTotp(record: SecondFactorRecord, code: string, now: Date): Promise<boolean> {
    const step = verifyTotp(this.secretOf(record), code, now, record.lastUsedStep);
    return step !== null && (await this.factors.useStep(record.accountId, step, now));
  }

  /**
   * Réserve un essai AVANT de regarder le code, en une opération (même mécanisme que la connexion, ADR-0017) :
   * des envois simultanés n'obtiennent pas plus de 3 essais.
   */
  private async claimAttempt(accountId: string): Promise<{ now: Date; attempts: number }> {
    const now = this.clock.now();
    const guard = await this.guards.claim(guardKey(accountId), now);
    if (isLocked(guard, now) && guard.lockedUntil) throw tooManyAttempts(guard.lockedUntil, now);
    return { now, attempts: guard.attempts };
  }

  /**
   * Mot de passe ou code faux. Chaque échec est inscrit au journal et compté sur 24 heures (relecture S6-T03).
   * - 3e échec en 15 minutes : blocage de 15 minutes, session FERMÉE (l'attaquant qui a volé une session doit repasser
   *   par le mot de passe) ;
   * - 10e échec en 24 heures : TOUTES les sessions du compte fermées (un essai lent ne passe pas inaperçu).
   * Dans les deux cas : journal (« mfa.locked ») et avis au titulaire. Sinon, l'erreur ordinaire.
   */
  private async failAttempt(
    session: AuthenticatedSession,
    now: Date,
    attempts: number,
    context: AuditContext,
    error: () => IdentityError,
  ): Promise<never> {
    const accountId = session.account.id;
    const until = new Date(now.getTime() + LOGIN_LOCK_MS);
    const actor = { type: "account" as const, id: accountId };
    const target = { type: "account" as const, id: accountId };
    const outcome = await this.transactions.run(async () => {
      const daily = await this.factors.recordFailure(accountId, now, FAILURE_WINDOW_MS);
      await this.audit.record({
        action: "mfa.failed",
        actor,
        target,
        details: { attempts, today: daily },
        context,
      });
      if (daily >= DAILY_MAX_FAILURES) {
        await this.guards.lock(guardKey(accountId), until);
        const closed = await this.sessions.revokeAllForAccount(accountId, now);
        await this.audit.record({
          action: "mfa.locked",
          actor,
          target,
          details: { attempts: daily, scope: "24h", sessionsClosed: closed },
          context,
        });
        return "locked" as const;
      }
      if (attempts < MAX_LOGIN_ATTEMPTS) return "wrong" as const;
      await this.guards.lock(guardKey(accountId), until);
      await this.sessions.revoke(session.sessionId, now);
      await this.audit.record({
        action: "mfa.locked",
        actor,
        target,
        details: { attempts, scope: "15min" },
        context,
      });
      return "locked" as const;
    });
    if (outcome === "wrong") throw error();
    this.notify(session.account, "locked");
    throw tooManyAttempts(until, now);
  }

  /** Avis de sécurité au titulaire (en arrière-plan ; un échec d'envoi ne bloque jamais l'action). */
  private notify(account: Pick<AccountView, "email" | "phone">, event: SecondFactorEvent): void {
    const destination = account.email ?? account.phone;
    if (destination) this.notices.notifySecondFactor(requireIdentifier(destination), event);
  }
}

function alreadyEnabled(): IdentityError {
  return new IdentityError(
    "DEUX_FACTEURS_DEJA_ACTIVE",
    "la double authentification est déjà activée sur ce compte",
  );
}

function notEnabled(): IdentityError {
  return new IdentityError(
    "DEUX_FACTEURS_A_ACTIVER",
    "activez d'abord la double authentification de votre compte",
  );
}
