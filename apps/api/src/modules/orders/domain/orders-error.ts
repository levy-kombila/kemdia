/** Codes d'erreur métier du module orders (stables : renvoyés par l'API dans le champ `code`). */
export type OrdersErrorCode =
  | "PANIER_PLEIN"
  | "PRODUIT_INDISPONIBLE"
  | "VARIANTE_INCONNUE"
  /** Le panier est déjà en cours de modification par une autre demande du même compte. */
  | "PANIER_OCCUPE"
  // Commandes (S5-T02, ADR-0024)
  | "PANIER_VIDE"
  | "PANIER_A_VERIFIER"
  | "PRIX_MODIFIE"
  | "ADRESSE_INVALIDE"
  | "NUMERO_PAIEMENT_INVALIDE"
  | "PAIEMENT_A_LA_LIVRAISON_INDISPONIBLE"
  | "COMMANDE_INTROUVABLE"
  | "ANNULATION_IMPOSSIBLE"
  | "CLE_DEJA_UTILISEE"
  | "TROP_DE_COMMANDES_OUVERTES"
  /** Aucun fournisseur Mobile Money sur cet environnement (S5-T07) : payer à la livraison. */
  | "MOBILE_MONEY_INDISPONIBLE"
  // Coupons (S5-T03, ADR-0025)
  | "COUPON_INVALIDE"
  | "COUPON_EXPIRE"
  | "COUPON_EPUISE"
  | "COUPON_DEJA_UTILISE"
  | "COUPON_MINIMUM_NON_ATTEINT"
  | "COUPON_NON_APPLICABLE"
  | "COUPON_EXISTE"
  | "COUPON_INTROUVABLE"
  | "COUPON_TROP_D_ESSAIS";

/** Une règle du panier ou de la commande n'est pas respectée. Le message est lisible par un humain, en français. */
export class OrdersError extends Error {
  constructor(
    readonly code: OrdersErrorCode,
    message: string,
    /** Quand réessayer, en secondes : renvoyé dans l'en-tête HTTP `Retry-After`. */
    readonly retryAfterSeconds?: number,
  ) {
    super(message);
    this.name = "OrdersError";
  }
}
