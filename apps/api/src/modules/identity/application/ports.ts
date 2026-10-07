import type { Account } from "../domain/account.js";
import type { Identifier, OtpChannel } from "../domain/identifier.js";
import type { OtpChallenge, OtpPurpose } from "../domain/otp.js";

/**
 * Ports du module identity (architecture hexagonale) : ce dont les cas d'utilisation ont besoin,
 * sans dire comment c'est fait. Implémentations dans infrastructure/, branchées dans identity.module.ts.
 */

export const ACCOUNT_REPOSITORY = Symbol("ACCOUNT_REPOSITORY");
export const OTP_CHALLENGE_REPOSITORY = Symbol("OTP_CHALLENGE_REPOSITORY");
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
  create(challenge: OtpChallenge): Promise<void>;
  /**
   * Le DERNIER défi envoyé pour cette destination et cet usage, utilisable ou non (ou `null`).
   * Jamais « le dernier encore utilisable » : un ancien code redeviendrait valable une fois le nouveau utilisé.
   */
  findLatest(destination: string, purpose: OtpPurpose): Promise<OtpChallenge | null>;
  /** Date du dernier envoi vers cette destination (tous usages confondus), ou `null`. */
  lastSentAt(destination: string): Promise<Date | null>;
  /** Nombre de codes envoyés vers cette destination depuis `since`. */
  countSentSince(destination: string, since: Date): Promise<number>;
  /** Enregistre le nombre d'essais et la consommation éventuelle. */
  save(challenge: OtpChallenge): Promise<void>;
}

/** Hachage des mots de passe (Argon2id, ADR-0015). */
export interface PasswordHasher {
  hash(password: string): Promise<string>;
  verify(hash: string, password: string): Promise<boolean>;
}

export interface OtpMessage {
  channel: OtpChannel;
  /** Identifiant normalisé du destinataire */
  to: string;
  code: string;
  purpose: OtpPurpose;
}

/** Envoi d'un code : console (développement), e-mail (S4-T02), SMS (quand le client aura choisi un fournisseur). */
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
