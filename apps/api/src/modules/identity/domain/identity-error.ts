/** Codes d'erreur métier de l'identité (stables : ils seront renvoyés par l'API à partir du S4-T02). */
export type IdentityErrorCode =
  | "IDENTIFIANT_INVALIDE"
  | "NOM_INVALIDE"
  | "MOT_DE_PASSE_FAIBLE"
  | "CANAL_INDISPONIBLE"
  | "ENVOI_TROP_RAPPROCHE"
  | "TROP_D_ENVOIS"
  | "CODE_INVALIDE"
  | "CODE_EXPIRE"
  | "TROP_D_ESSAIS"
  | "COMPTE_BLOQUE"
  | "IDENTIFIANTS_INCORRECTS"
  | "COMPTE_DESACTIVE"
  | "SESSION_INVALIDE"
  // Rôles et administration (S4-T06, ADR-0020)
  | "ACCES_REFUSE"
  | "RECONNEXION_REQUISE"
  | "ROLE_NON_ATTRIBUABLE"
  | "ROLE_SUR_SOI_INTERDIT"
  | "COMPTE_INTROUVABLE"
  | "COMPTE_INACTIF"
  // Limites par compte (S4-T07, ADR-0021)
  | "TROP_DE_REQUETES"
  // Double authentification de l'équipe (S6-T03, ADR-0034, MED-15)
  /** Mot de passe redemandé (QR code) incorrect. */
  | "MOT_DE_PASSE_INCORRECT"
  /** Clé TOTP_ENCRYPTION_KEY absente sur ce serveur : la double authentification n'y fonctionne pas. */
  | "DEUX_FACTEURS_INDISPONIBLE"
  /** Premier code envoyé avant d'avoir affiché le QR code. */
  | "DEUX_FACTEURS_A_CONFIGURER"
  | "DEUX_FACTEURS_DEJA_ACTIVE"
  /** Route d'équipe : la double authentification n'est pas encore activée sur ce compte. */
  | "DEUX_FACTEURS_A_ACTIVER"
  /** Route d'équipe : session pas (ou plus) confirmée par un code depuis 15 minutes. */
  | "DEUX_FACTEURS_REQUIS";

/** Une règle de l'identité n'est pas respectée. Le message est lisible par un humain, en français. */
export class IdentityError extends Error {
  constructor(
    readonly code: IdentityErrorCode,
    message: string,
    /** Quand réessayer, en secondes (limites d'envoi) : renvoyé dans l'en-tête HTTP `Retry-After`. */
    readonly retryAfterSeconds?: number,
  ) {
    super(message);
    this.name = "IdentityError";
  }
}
