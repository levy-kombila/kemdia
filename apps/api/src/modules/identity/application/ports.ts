import type { Account } from "../domain/account.js";
import type { Identifier, OtpChannel } from "../domain/identifier.js";
import type { OtpChallenge, OtpPurpose } from "../domain/otp.js";
import type { LoginGuardState } from "../domain/login-guard.js";
import type { Session } from "../domain/session.js";
import type { SignupTicket } from "../domain/signup-ticket.js";

/**
 * Ports du module identity (architecture hexagonale) : ce dont les cas d'utilisation ont besoin,
 * sans dire comment c'est fait. Implémentations dans infrastructure/, branchées dans identity.module.ts.
 */

export const ACCOUNT_REPOSITORY = Symbol("ACCOUNT_REPOSITORY");
export const OTP_CHALLENGE_REPOSITORY = Symbol("OTP_CHALLENGE_REPOSITORY");
export const SIGNUP_TICKET_REPOSITORY = Symbol("SIGNUP_TICKET_REPOSITORY");
export const LOGIN_GUARD_REPOSITORY = Symbol("LOGIN_GUARD_REPOSITORY");
export const SESSION_REPOSITORY = Symbol("SESSION_REPOSITORY");
export const IDENTITY_MAINTENANCE = Symbol("IDENTITY_MAINTENANCE");
export const PASSWORD_HASHER = Symbol("PASSWORD_HASHER");
export const OTP_SENDER = Symbol("OTP_SENDER");
export const IDENTITY_CLOCK = Symbol("IDENTITY_CLOCK");
export const IDENTITY_OPTIONS = Symbol("IDENTITY_OPTIONS");
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
 * - `signup-alert` : « quelqu'un a essayé de créer un compte avec votre adresse » (elle a déjà un compte, ADR-0016).
 */
export type OtpMessage = {
  channel: OtpChannel;
  /** Identifiant normalisé du destinataire */
  to: string;
} & ({ kind: "code"; code: string; purpose: OtpPurpose } | { kind: "signup-alert" });

/** Envoi des messages : console (développement), e-mail (S4-T02), SMS (quand le client aura choisi un fournisseur). */
export interface OtpSender {
  /** Canaux réellement disponibles avec cet adaptateur et cette configuration. */
  readonly channels: readonly OtpChannel[];
  send(message: OtpMessage): Promise<void>;
}

export interface Clock {
  now(): Date;
}

export interface IdentityOptions {
  /** `SMS_ENABLED` : le SMS n'est proposé qu'une fois un fournisseur branché (ADR-0015). */
  smsEnabled: boolean;
}
