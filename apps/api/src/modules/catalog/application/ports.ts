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

export const SORT_KEYS = ["pertinence", "nouveautes", "prix-asc", "prix-desc", "note"] as const;
export type SortKey = (typeof SORT_KEYS)[number];

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

/** Tranches de prix des filtres : mêmes clés et bornes que le site (apps/web/src/lib/filters.ts). */
export const DEFAULT_PRICE_RANGES: readonly PriceRange[] = Object.freeze([
  { key: "moins-50000", min: 0, max: 49_999 },
  { key: "50000-150000", min: 50_000, max: 150_000 },
  { key: "150000-300000", min: 150_001, max: 300_000 },
  { key: "plus-300000", min: 300_001, max: 100_000_000 },
]);

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
