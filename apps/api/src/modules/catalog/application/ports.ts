import { PRICE_RANGES, type Badge, type SortKey } from "@kemdia/contracts/constants";
import type { Category } from "../domain/category.js";
import type { Product } from "../domain/product.js";

/**
 * Ports du catalogue : ce dont l'application a besoin, sans dire COMMENT c'est stocké.
 * Implémentés par infrastructure/ (Prisma) et, dans les tests, par des versions en mémoire.
 */

export const CATEGORY_REPOSITORY = Symbol("CategoryRepository");
export const PRODUCT_REPOSITORY = Symbol("ProductRepository");

export interface CategoryRepository {
  findAll(): Promise<Category[]>;
  /** Crée ou met à jour (même identifiant). */
  save(category: Category): Promise<void>;
}

// Tris et sélections : définis par le contrat HTTP partagé avec le site (@kemdia/contracts)
export { SORT_KEYS, type Badge, type SortKey } from "@kemdia/contracts/constants";

/** Critères de sélection, déjà validés et normalisés par l'application. */
export interface ProductCriteria {
  /** Catégorie et ses descendantes ; `undefined` = tout le catalogue. */
  categoryIds?: readonly string[];
  /** Mots normalisés (`searchable`) : chacun doit apparaître dans le texte de recherche. */
  terms: readonly string[];
  priceMin?: number;
  priceMax?: number;
  brands: readonly string[];
  inStock: boolean;
  onlyDeals: boolean;
  minRating?: number;
  badge?: Badge;
}

/** Produit tel qu'affiché dans une liste (carte produit) : seulement les produits publiés. */
export interface ProductSummary {
  id: string;
  slug: string;
  title: string;
  brand: string | null;
  categoryId: string;
  image: string | null;
  price: number;
  compareAtPrice: number | null;
  inStock: boolean;
  /** Variante proposée par défaut : la variante active la moins chère (même règle que Product.mainVariant). */
  variantId: string;
  /** Stock de la variante par défaut. */
  stock: number;
  /** Nombre de variantes actives. */
  variantCount: number;
  rating: number;
  reviewCount: number;
  isFeatured: boolean;
  isBestseller: boolean;
  isNew: boolean;
}

export interface Page<T> {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export interface PriceRange {
  key: string;
  min: number;
  max: number;
}

/** Tranches de prix des filtres : celles du contrat partagé avec le site (@kemdia/contracts). */
export const DEFAULT_PRICE_RANGES: readonly PriceRange[] = Object.freeze(
  PRICE_RANGES.map(({ key, min, max }) => ({ key, min, max })),
);

/** Compteurs affichés à côté des filtres (« Beats (3) »), calculés AVANT application des filtres. */
export interface Facets {
  brands: { name: string; count: number }[];
  prices: { key: string; count: number }[];
  inStock: number;
  deals: number;
  rating4: number;
}

export interface ProductRepository {
  findBySlug(slug: string): Promise<Product | null>;
  /** Produits contenant ces variantes (vérification de disponibilité, BR-001). */
  findByVariantIds(variantIds: readonly string[]): Promise<Product[]>;
  search(
    criteria: ProductCriteria,
    sort: SortKey,
    page: number,
    pageSize: number,
  ): Promise<Page<ProductSummary>>;
  facets(criteria: ProductCriteria, priceRanges: readonly PriceRange[]): Promise<Facets>;
  /** Crée ou met à jour le produit ET ses variantes, en une seule transaction. */
  save(product: Product, searchText: string): Promise<void>;
}

/** Ligne à réserver ou à remettre en stock (S5-T02, BR-012). */
export interface StockLine {
  variantId: string;
  quantity: number;
}

/**
 * Variante réservée, avec les informations lues SUR LA LIGNE VERROUILLÉE (prix, titre…) : la commande les fige
 * telles qu'elles étaient au moment exact de la réservation.
 */
export interface ReservedVariant {
  variantId: string;
  productId: string;
  title: string;
  variantName: string;
  image: string | null;
  price: number;
  quantity: number;
}

export interface StockRepository {
  /**
   * Réserve chaque ligne par une mise à jour conditionnelle (stock suffisant, produit publié, variante active), dans
   * l'ordre des identifiants (pas d'interblocage entre deux commandes). S'arrête à la première ligne impossible et la
   * renvoie dans `failed` : c'est à l'appelant d'annuler la transaction. Doit tourner DANS une transaction.
   */
  reserve(lines: readonly StockLine[]): Promise<{ reserved: ReservedVariant[]; failed: string[] }>;
  /** Remet le stock (annulation, paiement non reçu) ; une variante supprimée entre-temps est ignorée. */
  release(lines: readonly StockLine[]): Promise<void>;
}
export const STOCK_REPOSITORY = Symbol("STOCK_REPOSITORY");
