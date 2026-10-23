import type {
  CategoryNode,
  CategoryView,
  Facets,
  ProductDetail,
  ProductPage,
  ProductQuery,
  PublicShop,
  PublicShopPage,
} from "@kemdia/contracts";

/**
 * Port du catalogue côté site (architecture hexagonale) : ce dont les pages ont besoin, sans dire d'où ça vient.
 * Un seul adaptateur depuis le S3-T08 : api-catalog.ts, l'API Kemdia (`/api/v1`), configuré au démarrage
 * (lib/config/catalog-source.ts). Le port reste : les pages ne dépendent que des objets du contrat (@kemdia/contracts),
 * et les tests peuvent fournir un faux catalogue.
 */
export interface CatalogPort {
  categoryTree(): Promise<CategoryNode[]>;
  /** `null` si la catégorie n'existe pas. */
  category(slug: string): Promise<CategoryView | null>;
  /** Catégorie inconnue → page vide (comme l'API). */
  products(query: ProductQuery): Promise<ProductPage>;
  facets(query: ProductQuery): Promise<Facets>;
  /** `null` si le produit n'existe pas ou n'est pas publié. */
  /** `city` : nom de la ville du client (S7.5-T03), qui départage deux offres au même prix. */
  product(slug: string, city?: string): Promise<ProductDetail | null>;
  /** Annuaire des boutiques actives (S7.5-T07) : officielle d'abord, puis le quartier du client, puis par nom. */
  shops(query: { city?: string; neighborhood?: string; page?: number }): Promise<PublicShopPage>;
  /** `null` si la boutique est inconnue ou pas active. */
  shop(slug: string): Promise<PublicShop | null>;
}

/** L'API ne répond pas, répond une erreur ou une réponse non conforme au contrat. */
export class CatalogUnavailableError extends Error {
  constructor(reason: string) {
    super(`Catalogue indisponible : ${reason}`);
    this.name = "CatalogUnavailableError";
  }
}
