import { PRICE_RANGES, type Badge, type SortKey } from "@kemdia/contracts/constants";
import type { Category } from "../domain/category.js";
import type {
  ListingContent,
  ListingVariantInfo,
  Seller,
  SellerProfile,
} from "../domain/listing.js";
import type { ImageSize, ProcessedImage } from "../domain/product-image.js";
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
  /** S7.5-T07 : fiches dont cette boutique a une offre visible (page publique de la boutique). */
  shopId?: string;
}

/**
 * Fiche telle qu'affichée dans une liste (carte produit) : une carte par fiche (S7.5-T02), quelle que soit le nombre de
 * boutiques qui la vendent ; prix et variante de l'offre mise en avant.
 */
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
  /** Nombre de déclinaisons proposées (au moins une offre active). */
  variantCount: number;
  /** Nombre d'offres visibles (boutiques qui vendent ce produit). */
  offerCount: number;
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

/** Fiche lue pour le site : contenu, déclinaisons, offres (toutes, visibles ou non) et boutiques. */
export interface ListingSnapshot {
  content: ListingContent;
  status: ProductStatus;
  /** Doublon fusionné : adresse de la fiche qui le remplace. */
  mergedIntoSlug: string | null;
  variants: readonly ListingVariantInfo[];
  offers: readonly Product[];
  sellers: ReadonlyMap<string, Seller>;
}

export interface ProductRepository {
  /** Fiche par son adresse (S7.5-T02). */
  findListingBySlug(slug: string): Promise<ListingSnapshot | null>;
  /** Produits contenant ces variantes (vérification de disponibilité, BR-001). */
  findByVariantIds(variantIds: readonly string[]): Promise<Product[]>;
  /** Une carte par fiche visible ; `city` départage les offres au même prix (offre mise en avant). */
  search(
    criteria: ProductCriteria,
    sort: SortKey,
    page: number,
    pageSize: number,
    city?: string | null,
  ): Promise<Page<ProductSummary>>;
  facets(criteria: ProductCriteria, priceRanges: readonly PriceRange[]): Promise<Facets>;
  /** Nombre de fiches visibles qui répondent aux critères (S7.5-T06 : faut-il corriger la recherche ?). */
  count(criteria: ProductCriteria): Promise<number>;
  /**
   * Recherche tolérante aux fautes (S7.5-T06), en UNE requête pour tous les mots : pour chaque mot, s'il figure déjà
   * dans le texte d'une fiche visible (`present`) et les mots de ces fiches qui lui ressemblent (trigrammes), du plus
   * au moins ressemblant, `limit` au plus (cherchés seulement pour les mots de 3 à 30 lettres).
   */
  similarWords(
    terms: readonly string[],
    limit: number,
  ): Promise<Map<string, { present: boolean; words: string[] }>>;
  /** Marques des fiches visibles qui répondent aux critères, les plus représentées d'abord (suggestions). */
  brands(criteria: ProductCriteria, limit: number): Promise<string[]>;
  /**
   * Crée ou met à jour une fiche de la boutique qui l'a créée (catalogue Kemdia importé) ET son offre : même
   * identifiant et même adresse, une déclinaison par variante. En une seule transaction.
   */
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
  /** Boutique qui vend le produit (S6-T07) : figée sur la ligne de commande */
  shopId: string;
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
  /** Déclinaison de la fiche (S7.5-T02) */
  listingVariantId: string;
  sku: string;
  name: string;
  attributes: Readonly<Record<string, string>>;
  price: number;
  compareAtPrice: number | null;
  stock: number;
  isActive: boolean;
}

/**
 * Offre d'une boutique (« produit » pour le vendeur), telle que le vendeur et la modération la voient (tous statuts).
 * Titre, description, marque, catégorie et photos sont ceux de sa FICHE (S7.5-T02) : le vendeur les écrit seulement
 * sur une fiche qu'il a créée et qui n'est pas encore publiée.
 */
export interface VendorProductRecord {
  id: string;
  shopId: string;
  listingId: string;
  listingSlug: string;
  listingStatus: ProductStatus;
  /** Boutique qui a créé la fiche */
  listingOwnerShopId: string;
  /** Déclinaisons de la fiche (S7.5-T03 : celles que l'offre peut encore ajouter) */
  listingVariants: readonly {
    id: string;
    name: string;
    attributes: Readonly<Record<string, string>>;
  }[];
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
  /**
   * Crée l'offre et ses variantes ; si `record.listingId === record.id`, crée aussi sa fiche (contenu, une déclinaison
   * par variante, mêmes identifiants). `false` si l'adresse lisible est déjà prise.
   */
  insert(record: VendorProductRecord, derived: DerivedFields): Promise<boolean>;
  /**
   * Écrit le statut, la modération, les prix, le stock et l'activation des variantes. Le contenu (titre, photos…) est
   * écrit sur la fiche seulement si la boutique l'a créée et qu'elle n'est pas publiée (sinon la base garde celui de
   * la fiche).
   */
  update(record: VendorProductRecord, derived: DerivedFields): Promise<void>;
  /** Ajoute une variante à une offre (déclinaison existante de sa fiche). */
  insertVariant(productId: string, variant: VendorVariantRecord, position: number): Promise<void>;
  /** Offre de la boutique sur cette fiche, s'il y en a une (tous statuts). */
  findOffer(listingId: string, shopId: string): Promise<VendorProductRecord | null>;
  /** Toutes les offres d'une fiche (équipe). */
  listForListing(listingId: string): Promise<VendorProductRecord[]>;
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

// --- Fiches communes (S7.5-T02, ADR-0049) ---

export const LISTING_REPOSITORY = Symbol("ListingRepository");

export interface ListingVariantRecord {
  id: string;
  name: string;
  attributes: Readonly<Record<string, string>>;
  position: number;
}

/** Fiche telle que le vendeur (recherche) et l'équipe la voient, tous statuts. */
export interface ListingRecord {
  id: string;
  slug: string;
  title: string;
  description: string;
  brand: string | null;
  categoryId: string;
  images: readonly string[];
  status: ProductStatus;
  createdByShopId: string;
  mergedIntoId: string | null;
  offerCount: number;
  price: number;
  createdAt: Date;
  updatedAt: Date;
  variants: readonly ListingVariantRecord[];
}

export interface ListingCursor {
  at: Date;
  id: string;
}

export interface ListingRepository {
  findById(id: string): Promise<ListingRecord | null>;
  /** Lit la fiche et la verrouille jusqu'à la fin de la transaction. */
  lockById(id: string): Promise<ListingRecord | null>;
  /** Fiches publiées (non fusionnées) dont le texte de recherche contient tous les mots. */
  searchPublished(terms: readonly string[], limit: number): Promise<ListingRecord[]>;
  /** Liste de l'équipe : du plus récent au plus ancien, filtre de statut et de mots facultatif. */
  list(query: {
    terms: readonly string[];
    status?: ProductStatus | undefined;
    limit: number;
    after?: ListingCursor | undefined;
  }): Promise<{ items: ListingRecord[]; next: ListingCursor | null }>;
  /** Contenu (titre, description, marque, catégorie, photos) et texte de recherche : recopiés sur les offres. */
  updateContent(listing: ListingRecord, searchText: string, now: Date): Promise<void>;
  /** Nouvelle déclinaison, ou déclinaison renommée (recopiée sur les variantes des offres). */
  saveVariant(listingId: string, variant: ListingVariantRecord, now: Date): Promise<void>;
  /**
   * Fusion d'un doublon : ses offres passent sur `targetId` (chaque variante sur la déclinaison donnée par `variantMap`),
   * puis la fiche est archivée et mène à la cible. Doit tourner DANS une transaction.
   */
  merge(
    sourceId: string,
    targetId: string,
    variantMap: ReadonlyMap<string, string>,
    now: Date,
  ): Promise<void>;
}

// --- Propositions de correction (S7.5-T03) ---

export const LISTING_CORRECTION_REPOSITORY = Symbol("ListingCorrectionRepository");

export interface ListingCorrectionRecord {
  id: string;
  listingId: string;
  listingTitle: string;
  listingSlug: string;
  shopId: string;
  message: string;
  createdAt: Date;
  closedBy: string | null;
  closedAt: Date | null;
  note: string | null;
}

export interface ListingCorrectionRepository {
  insert(record: Omit<ListingCorrectionRecord, "listingTitle" | "listingSlug">): Promise<void>;
  findById(id: string): Promise<ListingCorrectionRecord | null>;
  /** Lit la proposition et la verrouille jusqu'à la fin de la transaction. */
  lockById(id: string): Promise<ListingCorrectionRecord | null>;
  countOpen(shopId: string): Promise<number>;
  /** Ouvertes : de la plus ancienne à la plus récente ; closes : de la plus récente à la plus ancienne. */
  list(query: {
    open: boolean;
    listingId?: string | undefined;
    limit: number;
    after?: ListingCursor | undefined;
  }): Promise<{ items: ListingCorrectionRecord[]; next: ListingCursor | null }>;
  close(id: string, by: string, note: string | null, now: Date): Promise<void>;
}

export const SELLER_DIRECTORY = Symbol("SellerDirectory");

/** Boutiques vues du catalogue (S7.5-T02) : copie tenue par le module vendors. */
export interface SellerDirectory {
  /** Crée ou met à jour la copie ; `since` n'est retenu qu'à la création (première validation). */
  save(shopId: string, seller: SellerProfile): Promise<void>;
}

export const PUBLIC_SHOPS = Symbol("PublicShops");

/** Boutique publique (S7.5-T07) : sa copie et le nombre de produits visibles qu'elle vend. */
export interface PublicShop extends SellerProfile {
  shopId: string;
  productCount: number;
}

/** Annuaire et pages publiques des boutiques (S7.5-T07), lus dans la copie du catalogue. */
export interface PublicShops {
  /**
   * Boutiques actives, la boutique officielle d'abord, puis celles du quartier `neighborhood` (s'il est donné), puis
   * par nom ; `city` limite à une ville.
   */
  list(query: {
    city?: string;
    neighborhood?: string;
    page: number;
    pageSize: number;
  }): Promise<Page<PublicShop>>;
  /** Boutique ACTIVE par son adresse ; `null` sinon (inconnue, en attente, suspendue). */
  findActiveBySlug(slug: string): Promise<PublicShop | null>;
}

/** Champs calculés à partir du domaine : prix « à partir de » et texte de recherche. */
export interface DerivedFields {
  price: number;
  compareAtPrice: number | null;
  searchText: string;
}

// --- Photos des produits (S6-T04, ADR-0035) ---

export const IMAGE_PROCESSOR = Symbol("ImageProcessor");
export const PRODUCT_IMAGE_STORE = Symbol("ProductImageStore");

/**
 * Réencode un fichier reçu (déjà reconnu par `checkUpload`) : WebP sans métadonnées, en deux tailles. Lève une
 * `CatalogError` (`FORMAT_IMAGE_INVALIDE`, `IMAGE_TROP_GRANDE`, `IMAGE_TROP_PETITE`) si l'image est illisible ou hors
 * limites.
 */
export interface ImageProcessor {
  process(bytes: Uint8Array): Promise<ProcessedImage>;
}

export interface StoredImage {
  id: string;
  productId: string;
  bytes: Uint8Array;
  sha256: string;
}

/**
 * Rangement des photos (port remplaçable : PostgreSQL aujourd'hui, stockage objet plus tard). Les écritures
 * rejoignent la transaction en cours.
 */
export interface ProductImageStore {
  save(imageId: string, productId: string, image: ProcessedImage, now: Date): Promise<void>;
  /** Produit et empreinte d'une photo, SANS ses octets (contrôle d'accès avant toute lecture coûteuse). */
  describe(imageId: string): Promise<{ productId: string; sha256: string } | null>;
  read(imageId: string, size: ImageSize): Promise<StoredImage | null>;
  /** Efface la photo de CE produit (rien si elle appartient à un autre). */
  delete(imageId: string, productId: string): Promise<void>;
}
