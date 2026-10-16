/** Codes d'erreur métier du catalogue (stables : ils seront renvoyés par l'API). */
export type CatalogErrorCode =
  | "IDENTIFIANT_INVALIDE"
  | "SLUG_INVALIDE"
  | "PRIX_INVALIDE"
  | "STOCK_INVALIDE"
  | "PRODUIT_INVALIDE"
  | "VARIANTE_INVALIDE"
  | "CATEGORIE_INVALIDE"
  | "ARBORESCENCE_INVALIDE"
  // Produits des vendeurs (S6-T02)
  | "CATEGORIE_INCONNUE"
  | "PRODUIT_INTROUVABLE"
  | "VARIANTE_INTROUVABLE"
  | "STATUT_PRODUIT_INCOMPATIBLE"
  /** Le stock a changé (commande passée ou annulée) depuis que le vendeur l'a lu : il doit le relire. */
  | "STOCK_MODIFIE"
  /** Le vendeur a modifié le produit depuis que le modérateur l'a lu : relire avant de décider (relecture S6-T02). */
  | "PRODUIT_MODIFIE"
  /** Trop de produits de la boutique attendent déjà la modération. */
  | "TROP_DE_PRODUITS_EN_ATTENTE";

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
