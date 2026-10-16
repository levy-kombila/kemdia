import { PRICE_RANGES, type Badge, type SortKey } from "@kemdia/contracts/constants";
import type { Category } from "../domain/category.js";
import type { Product, ProductStatus } from "../domain/product.js";

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
  /** Prix barré : la variante est « en promotion » (coupons non cumulables, BR-031) */
  compareAtPrice: number | null;
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

// --- Produits des vendeurs et modération (S6-T02, ADR-0033) ---

export const VENDOR_PRODUCT_REPOSITORY = Symbol("VendorProductRepository");
export const CATALOG_RANDOM = Symbol("CatalogRandom");

export interface CatalogRandom {
  uuid(): string;
  /** `size` caractères [a-z0-9] (adresse lisible) */
  slugSuffix(size: number): string;
  /** 8 caractères [A-Z0-9] (préfixe des références de variantes) */
  skuPrefix(): string;
}

export interface VendorVariantRecord {
  id: string;
  sku: string;
  name: string;
  attributes: Readonly<Record<string, string>>;
  price: number;
  compareAtPrice: number | null;
  stock: number;
  isActive: boolean;
}

/** Produit d'une boutique, tel que le vendeur et la modération le voient (tous statuts). */
export interface VendorProductRecord {
  id: string;
  shopId: string;
  slug: string;
  title: string;
  description: string;
  brand: string | null;
  categoryId: string;
  images: readonly string[];
  status: ProductStatus;
  moderationReason: string | null;
  submittedAt: Date | null;
  reviewedBy: string | null;
  reviewedAt: Date | null;
  shopSuspended: boolean;
  createdAt: Date;
  updatedAt: Date;
  variants: readonly VendorVariantRecord[];
}

/** Position dans une liste : date (création ou demande) puis identifiant. */
export interface VendorProductCursor {
  at: Date;
  id: string;
}

export interface VendorProductRepository {
  findById(id: string): Promise<VendorProductRecord | null>;
  /** Lit le produit et le verrouille (ainsi que ses variantes) jusqu'à la fin de la transaction. */
  lockById(id: string): Promise<VendorProductRecord | null>;
  /** Crée le produit et ses variantes ; `false` si l'adresse lisible est déjà prise. */
  insert(record: VendorProductRecord, derived: DerivedFields): Promise<boolean>;
  /** Écrit les champs modifiables et les variantes (prix, stock, activation). */
  update(record: VendorProductRecord, derived: DerivedFields): Promise<void>;
  /** Produits d'une boutique, du plus récent au plus ancien. */
  listForShop(
    shopId: string,
    query: {
      status?: ProductStatus | undefined;
      limit: number;
      after?: VendorProductCursor | undefined;
    },
  ): Promise<{ items: VendorProductRecord[]; next: VendorProductCursor | null }>;
  /** File de modération (produits des vendeurs), de la demande la plus ancienne à la plus récente. */
  moderationQueue(query: {
    status: ProductStatus;
    limit: number;
    after?: VendorProductCursor | undefined;
  }): Promise<{ items: VendorProductRecord[]; next: VendorProductCursor | null }>;
  /** Produits de la boutique en attente de modération. */
  countPending(shopId: string): Promise<number>;
  /** Cache (ou montre à nouveau) tous les produits d'une boutique. Renvoie le nombre de produits concernés. */
  setShopSuspended(shopId: string, suspended: boolean): Promise<number>;
}

/** Champs calculés à partir du domaine : prix « à partir de » et texte de recherche. */
export interface DerivedFields {
  price: number;
  compareAtPrice: number | null;
  searchText: string;
}
