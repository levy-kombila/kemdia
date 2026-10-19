import type { Account } from "../domain/account.js";
import type { Identifier, OtpChannel } from "../domain/identifier.js";
import type { OtpChallenge, OtpPurpose } from "../domain/otp.js";
import type { LoginGuardState } from "../domain/login-guard.js";
import type { Session } from "../domain/session.js";
import type { ResetTicket } from "../domain/reset-ticket.js";
import type { SignupTicket } from "../domain/signup-ticket.js";
import type { StoredRole } from "../domain/role.js";

/**
 * Ports du module identity (architecture hexagonale) : ce dont les cas d'utilisation ont besoin,
 * sans dire comment c'est fait. Implémentations dans infrastructure/, branchées dans identity.module.ts.
 */

export const ACCOUNT_REPOSITORY = Symbol("ACCOUNT_REPOSITORY");
export const OTP_CHALLENGE_REPOSITORY = Symbol("OTP_CHALLENGE_REPOSITORY");
export const SIGNUP_TICKET_REPOSITORY = Symbol("SIGNUP_TICKET_REPOSITORY");
export const LOGIN_GUARD_REPOSITORY = Symbol("LOGIN_GUARD_REPOSITORY");
export const RESET_TICKET_REPOSITORY = Symbol("RESET_TICKET_REPOSITORY");
export const SESSION_REPOSITORY = Symbol("SESSION_REPOSITORY");
export const IDENTITY_MAINTENANCE = Symbol("IDENTITY_MAINTENANCE");
export const PASSWORD_HASHER = Symbol("PASSWORD_HASHER");
export const OTP_SENDER = Symbol("OTP_SENDER");
export const IDENTITY_CLOCK = Symbol("IDENTITY_CLOCK");
export const IDENTITY_OPTIONS = Symbol("IDENTITY_OPTIONS");
export const ROLE_REPOSITORY = Symbol("ROLE_REPOSITORY");
export const TRANSACTION_RUNNER = Symbol("TRANSACTION_RUNNER");
/** Facultatif : tirage du code et de l'identifiant du défi, remplacé dans les tests. */
export const OTP_RANDOM = Symbol("OTP_RANDOM");

export interface OtpRandom {
  /** Entier aléatoire cryptographique dans [0, max[ */
  int(max: number): number;
  uuid(): string;
}

export interface AccountRepository {
  findById(id: string): Promise<Account | null>;
  findByIdentifier(identifier: Identifier): Promise<Account | null>;
  /** Crée ou met à jour. Un identifiant déjà pris lève `IdentifierTakenError`. */
  save(account: Account): Promise<void>;
}

/** Levée par `AccountRepository.save` quand l'e-mail ou le téléphone appartient déjà à un autre compte. */
export class IdentifierTakenError extends Error {
  constructor() {
    super("identifiant déjà utilisé par un autre compte");
    this.name = "IdentifierTakenError";
  }
}

export interface OtpChallengeRepository {
  /**
   * Crée le défi SI les limites d'envoi le permettent, de façon atomique (verrou par destination) :
   * `check` reçoit les dates des envois de la dernière heure vers cette destination pour cet usage,
   * et lève une erreur pour refuser. Deux demandes simultanées ne passent jamais ensemble.
   */
  createWithinLimits(challenge: OtpChallenge, check: (sentLastHour: Date[]) => void): Promise<void>;
  /**
   * Le DERNIER défi envoyé pour cette destination et cet usage, utilisable ou non (ou `null`).
   * Jamais « le dernier encore utilisable » : un ancien code redeviendrait valable une fois le nouveau utilisé.
   */
  findLatest(destination: string, purpose: OtpPurpose): Promise<OtpChallenge | null>;
  /**
   * Compte un essai en UNE requête (`attempts = attempts + 1` si le défi est encore utilisable).
   * Renvoie le nombre d'essais après celui-ci, ou `null` si le défi n'était plus utilisable.
   */
  claimAttempt(id: string, now: Date): Promise<number | null>;
  /** Marque le défi utilisé, une seule fois : `false` s'il l'était déjà (deux bons essais simultanés). */
  consume(id: string, now: Date): Promise<boolean>;
}

export interface SignupTicketRepository {
  /** Enregistre un ticket et ANNULE les tickets précédents de la même destination (une seule inscription en cours). */
  replaceForDestination(ticket: SignupTicket): Promise<void>;
  findByHash(ticketHash: string): Promise<SignupTicket | null>;
  deleteForDestination(destination: string): Promise<void>;
}

export interface ResetTicketRepository {
  /** Enregistre un ticket et ANNULE les précédents de la même destination. */
  replaceForDestination(ticket: ResetTicket): Promise<void>;
  findByHash(ticketHash: string): Promise<ResetTicket | null>;
  deleteForDestination(destination: string): Promise<void>;
  /**
   * Termine une réinitialisation en UNE transaction (ADR-0018) : nouveau mot de passe (version +1)
   * si le compte est toujours actif et à la version attendue, tickets de la destination supprimés,
   * sessions fermées, compteurs BR-040 des identifiants du compte effacés.
   * Renvoie false (et ne change rien) si le compte a changé entre-temps.
   */
  applyReset(change: PasswordResetChange): Promise<boolean>;
  /**
   * Changement depuis « Mon compte » (S7-T07) : nouveau mot de passe seulement si le compte est actif et n'a pas changé
   * de mot de passe entre-temps (verrou optimiste), puis TOUTES ses sessions fermées. Faux si rien n'a été changé.
   */
  applyPasswordChange(change: PasswordChange): Promise<boolean>;
}

export interface PasswordChange {
  accountId: string;
  /** Version lue avant le changement (verrou optimiste) */
  expectedVersion: number;
  passwordHash: string;
  now: Date;
}

export interface PasswordResetChange {
  accountId: string;
  /** Version lue avant le changement (verrou optimiste) */
  expectedVersion: number;
  passwordHash: string;
  destination: string;
  /** E-mail et téléphone du compte : le blocage est levé pour les deux */
  guardIdentifiers: string[];
  now: Date;
}

/** BR-040 par identifiant (ADR-0017). Toutes les opérations sont atomiques en base. */
export interface LoginGuardRepository {
  /** Réserve un essai selon `nextGuardState` en UNE opération et renvoie le nouvel état. */
  claim(identifier: string, now: Date): Promise<LoginGuardState>;
  /** Bloque jusqu'à `until` (si pas déjà bloqué plus longtemps). */
  lock(identifier: string, until: Date): Promise<void>;
  /**
   * Connexion réussie : compteur remis à zéro, SAUF si un blocage est en cours (posé en parallèle par d'autres
   * tentatives) : une réussite ne doit pas offrir de nouveaux essais à un attaquant.
   */
  reset(identifier: string, now: Date): Promise<void>;
}

export interface SessionRepository {
  create(session: Session): Promise<void>;
  findByTokenHash(tokenHash: string): Promise<Session | null>;
  renew(id: string, expiresAt: Date, lastSeenAt: Date): Promise<void>;
  revoke(id: string, now: Date): Promise<void>;
  /** Révoque toutes les sessions encore actives du compte ; renvoie leur nombre. */
  revokeAllForAccount(accountId: string, now: Date): Promise<number>;
  /** La session vient d'être confirmée par la double authentification (S6-T03) ; sans effet si elle est fermée. */
  confirmSecondFactor(id: string, now: Date): Promise<void>;
}

/** Ménage périodique : sessions, codes, tickets et compteurs périmés (rien d'utile n'est supprimé). */
export interface IdentityMaintenance {
  purgeExpired(now: Date): Promise<Record<string, number>>;
}

/** Hachage des mots de passe (Argon2id, ADR-0015). */
export interface PasswordHasher {
  hash(password: string): Promise<string>;
  verify(hash: string, password: string): Promise<boolean>;
  /**
   * Hachage d'un mot de passe que personne ne connaît, avec les mêmes réglages : comparé quand l'identifiant n'a pas
   * de compte, pour que la réponse prenne le même temps. Constant : aucun calcul (donc aucun échec) à l'exécution.
   */
  readonly dummyHash: string;
}

/**
 * Message envoyé à un identifiant :
 * - `code` : le code à usage unique ;
 * - `signup-alert` : « quelqu'un a essayé de créer un compte avec votre adresse » (elle a déjà un compte, ADR-0016) ;
 * - `password-changed` : « votre mot de passe vient d'être modifié » (S4-T04, ADR-0018) ;
 * - `second-factor` : avis de sécurité de la double authentification (S6-T03).
 */
export type OtpMessage = {
  channel: OtpChannel;
  /** Identifiant normalisé du destinataire */
  to: string;
} & (
  | { kind: "code"; code: string; purpose: OtpPurpose }
  | { kind: "signup-alert" }
  | { kind: "password-changed" }
  | { kind: "second-factor"; event: SecondFactorEvent }
);

/** Envoi des messages : console (développement), e-mail (S4-T02), SMS (quand le client aura choisi un fournisseur). */
export interface OtpSender {
  /** Canaux réellement disponibles avec cet adaptateur et cette configuration. */
  readonly channels: readonly OtpChannel[];
  send(message: OtpMessage): Promise<void>;
}

/** Résultat d'un ajout de rôle : ajouté, déjà présent, compte non actif, compte inexistant. */
export type GrantOutcome = "granted" | "unchanged" | "inactive" | "missing";

/** Rôles enregistrés (S4-T06, ADR-0020). Lus avec le compte (AccountRepository), écrits seulement ici. */
export interface RoleRepository {
  /**
   * Ajoute le rôle s'il manque. Le compte est verrouillé et son statut relu DANS la transaction :
   * un compte désactivé ou supprimé au même moment ne reçoit jamais de rôle. `grantedBy` vide = commande serveur.
   */
  grant(
    accountId: string,
    role: StoredRole,
    grantedBy: string | null,
    now: Date,
  ): Promise<GrantOutcome>;
  /** Retire le rôle ; `true` s'il était présent. */
  revoke(accountId: string, role: StoredRole): Promise<boolean>;
}

/**
 * Transaction partagée (ADR-0020) : tout ce que `work` écrit — dans ce module ET dans le journal d'audit —
 * est enregistré ensemble ou pas du tout. Un appel imbriqué rejoint la transaction en cours.
 */
export interface TransactionRunner {
  run<T>(work: () => Promise<T>): Promise<T>;
}

export interface Clock {
  now(): Date;
}

export interface IdentityOptions {
  /** `SMS_ENABLED` : le SMS n'est proposé qu'une fois un fournisseur branché (ADR-0015). */
  smsEnabled: boolean;
}

// --- Double authentification de l'équipe (S6-T03, ADR-0034, MED-15) ---

export const SECOND_FACTOR_REPOSITORY = Symbol("SECOND_FACTOR_REPOSITORY");
export const SECRET_BOX = Symbol("SECRET_BOX");

/** Avis de sécurité envoyé au titulaire. */
export type SecondFactorEvent =
  "setup" | "enabled" | "recovery-used" | "recovery-regenerated" | "locked" | "reset";

export interface SecondFactorRecord {
  accountId: string;
  /** Secret TOTP chiffré (`SecretBox`) */
  secretBox: Uint8Array;
  /** Vide tant que le premier code n'a pas été donné */
  enabledAt: Date | null;
  /** Dernière période de 30 s utilisée (un code ne sert qu'une fois) */
  lastUsedStep: number | null;
}

/**
 * Double authentification et codes de secours. Les écritures rejoignent la transaction en cours (activation, codes
 * de secours, confirmation de la session et journal d'audit ensemble).
 */
export interface SecondFactorRepository {
  find(accountId: string): Promise<SecondFactorRecord | null>;
  /** Lit et verrouille jusqu'à la fin de la transaction (codes envoyés en même temps). */
  lock(accountId: string): Promise<SecondFactorRecord | null>;
  /** Nouveau secret en attente ; `false` si la double authentification est déjà activée (jamais remplacée). */
  savePending(accountId: string, secretBox: Uint8Array, now: Date): Promise<boolean>;
  enable(accountId: string, step: number, now: Date): Promise<boolean>;
  /** Enregistre la période utilisée si elle est plus récente que la dernière ; `false` sinon (rejeu). */
  useStep(accountId: string, step: number, now: Date): Promise<boolean>;
  replaceRecoveryCodes(accountId: string, hashes: readonly string[], now: Date): Promise<void>;
  /** Marque le code utilisé ; `false` s'il est inconnu ou déjà utilisé. */
  useRecoveryCode(accountId: string, hash: string, now: Date): Promise<boolean>;
  countUnusedRecoveryCodes(accountId: string): Promise<number>;
  /**
   * Compte un échec sur la fenêtre de 24 heures (repart de 1 si la fenêtre est passée) et renvoie le total. 0 si le
   * compte n'a pas encore de double authentification (aucune ligne). Jamais remis à zéro par une réussite.
   */
  recordFailure(accountId: string, now: Date, windowMs: number): Promise<number>;
  /** Supprime la double authentification et ses codes ; `false` s'il n'y en avait pas. */
  remove(accountId: string): Promise<boolean>;
}

/** Chiffrement des secrets TOTP, lié au compte (le secret d'un compte ne s'ouvre pas pour un autre). */
export interface SecretBox {
  /** Clé configurée (sinon la double authentification est indisponible sur ce serveur) */
  readonly available: boolean;
  seal(plain: Uint8Array, accountId: string): Uint8Array;
  open(box: Uint8Array, accountId: string): Uint8Array;
}
