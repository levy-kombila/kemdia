/** Codes d'erreur métier du module orders (stables : renvoyés par l'API dans le champ `code`). */
export type OrdersErrorCode =
  | "PANIER_PLEIN"
  | "PRODUIT_INDISPONIBLE"
  | "VARIANTE_INCONNUE"
  /** Le panier est déjà en cours de modification par une autre demande du même compte. */
  | "PANIER_OCCUPE";

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
