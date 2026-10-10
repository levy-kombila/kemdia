/** Codes d'erreur métier du module payments (stables : renvoyés par l'API dans le champ `code`). */
export type PaymentsErrorCode =
  /** La commande n'attend pas de paiement Mobile Money (à la livraison, déjà payée, annulée, délai dépassé). */
  | "PAIEMENT_IMPOSSIBLE"
  /** Un essai attend encore la validation sur le téléphone. */
  | "PAIEMENT_EN_COURS"
  | "TROP_D_ESSAIS_PAIEMENT"
  /** Aucun fournisseur Mobile Money branché, ou l'opérateur ne répond pas. */
  | "PAIEMENT_INDISPONIBLE"
  | "PAIEMENT_INTROUVABLE"
  | "REMBOURSEMENT_INTROUVABLE"
  | "REMBOURSEMENT_DEJA_FAIT"
  | "ENCAISSEMENT_IMPOSSIBLE";

/** Une règle du paiement n'est pas respectée. Le message est lisible par un humain, en français. */
export class PaymentsError extends Error {
  constructor(
    readonly code: PaymentsErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "PaymentsError";
  }
}
