/** Codes d'erreur métier du module shipping (stables : renvoyés par l'API dans le champ `code`). */
export type ShippingErrorCode =
  | "EXPEDITION_INTROUVABLE"
  /** La commande n'est pas prête (paiement, vendeur) ou ne peut pas être annulée */
  | "EXPEDITION_IMPOSSIBLE"
  /** L'action ne s'applique pas à une expédition dans cet état (ex. livrer une expédition en échec) */
  | "STATUT_EXPEDITION_INCOMPATIBLE"
  /** Motif ou note mal remplis */
  | "EXPEDITION_INVALIDE"
  /** Barème incomplet ou hors bornes */
  | "TARIFS_INVALIDES";

export class ShippingError extends Error {
  constructor(
    readonly code: ShippingErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "ShippingError";
  }
}
