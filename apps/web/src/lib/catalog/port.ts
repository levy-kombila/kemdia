import type {
  CategoryNode,
  CategoryView,
  Facets,
  ProductDetail,
  ProductPage,
  ProductQuery,
} from "@kemdia/contracts";

/**
 * Port du catalogue côté site (architecture hexagonale) : ce dont les pages ont besoin, sans dire d'où ça vient.
 * Deux adaptateurs, choisis au démarrage (lib/config/catalog-source.ts) :
 * - api-catalog.ts : l'API Kemdia (`/api/v1`) ;
 * - file-catalog.ts : le fichier de démonstration (développement sans base, jusqu'au S3-T08).
 * Les deux renvoient les objets du contrat partagé (@kemdia/contracts) : les pages ne voient pas la différence.
 */
export interface CatalogPort {
  categoryTree(): Promise<CategoryNode[]>;
  /** `null` si la catégorie n'existe pas. */
  category(slug: string): Promise<CategoryView | null>;
  /** Catégorie inconnue → page vide (comme l'API). */
  products(query: ProductQuery): Promise<ProductPage>;
  facets(query: ProductQuery): Promise<Facets>;
  /** `null` si le produit n'existe pas ou n'est pas publié. */
  product(slug: string): Promise<ProductDetail | null>;
}

/** L'API ne répond pas, répond une erreur ou une réponse non conforme au contrat. */
export class CatalogUnavailableError extends Error {
  constructor(reason: string) {
    super(`Catalogue indisponible : ${reason}`);
    this.name = "CatalogUnavailableError";
  }
}
