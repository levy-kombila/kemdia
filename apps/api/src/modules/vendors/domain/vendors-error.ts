/** Codes d'erreur métier du module vendors (stables : renvoyés par l'API dans le champ `code`). */
export type VendorsErrorCode =
  /** Demande ou motif mal rempli (champ en cause dans le message). */
  | "BOUTIQUE_INVALIDE"
  /** Le compte a déjà une boutique (en attente, active ou suspendue). */
  | "BOUTIQUE_EXISTE"
  /** Une autre boutique porte déjà ce nom (ou un nom identique aux accents et à la ponctuation près). */
  | "NOM_BOUTIQUE_PRIS"
  | "BOUTIQUE_INTROUVABLE"
  /** La décision ne s'applique pas à une boutique dans cet état (ex. refuser une boutique déjà active). */
  | "STATUT_BOUTIQUE_INCOMPATIBLE"
  /** Un administrateur ne décide jamais pour sa propre boutique. */
  | "BOUTIQUE_SUR_SOI_INTERDITE"
  /** Le compte du vendeur est fermé ou n'existe plus : la boutique ne peut pas être validée. */
  | "PROPRIETAIRE_INACTIF"
  /** Une autre opération verrouille la boutique ou la demande : réessayer dans un instant. */
  | "BOUTIQUE_OCCUPEE";

/** Une règle des boutiques n'est pas respectée. Le message est lisible par un humain, en français. */
export class VendorsError extends Error {
  constructor(
    readonly code: VendorsErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "VendorsError";
  }
}
