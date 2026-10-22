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
  | "ENCAISSEMENT_IMPOSSIBLE"
  // Notifications de l'opérateur et bac à sable (S5-T05, ADR-0027)
  /** Signature absente, mal formée ou fausse. */
  | "SIGNATURE_INVALIDE"
  /** Signature authentique, mais hors de la fenêtre de 5 minutes. */
  | "NOTIFICATION_EXPIREE"
  /** Téléphone simulé : aucune demande en attente avec cet identifiant pour ce compte. */
  | "DEMANDE_INTROUVABLE"
  | "CODE_PIN_INVALIDE"
  // Factures (S5-T06, ADR-0028)
  | "FACTURE_INTROUVABLE"
  /** Renvoi d'une facture impossible : envoi automatique en cours, pas d'e-mail vérifié, ou renvoyée il y a peu */
  | "ENVOI_IMPOSSIBLE";

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
