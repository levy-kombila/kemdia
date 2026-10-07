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
  | "COMPTE_BLOQUE";

/** Une règle de l'identité n'est pas respectée. Le message est lisible par un humain, en français. */
export class IdentityError extends Error {
  constructor(
    readonly code: IdentityErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "IdentityError";
  }
}
