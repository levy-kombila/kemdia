/** Codes d'erreur métier du catalogue (stables : ils seront renvoyés par l'API). */
export type CatalogErrorCode =
  | "IDENTIFIANT_INVALIDE"
  | "SLUG_INVALIDE"
  | "PRIX_INVALIDE"
  | "STOCK_INVALIDE"
  | "PRODUIT_INVALIDE"
  | "VARIANTE_INVALIDE"
  | "CATEGORIE_INVALIDE"
  | "ARBORESCENCE_INVALIDE";

/** Une règle du catalogue n'est pas respectée. Le message est lisible par un humain, en français. */
export class CatalogError extends Error {
  constructor(
    readonly code: CatalogErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "CatalogError";
  }
}
