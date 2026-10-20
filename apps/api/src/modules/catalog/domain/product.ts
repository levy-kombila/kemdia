import { CatalogError } from "./catalog-error.js";
import { imagePath } from "./category.js";
import {
  assertPrice,
  assertSlug,
  assertStock,
  assertUuid,
  requiredText,
  searchable,
} from "./values.js";

/**
 * Statut d'un produit :
 * - PUBLISHED : visible et commandable (si du stock existe et si sa boutique n'est pas suspendue) ;
 * - DRAFT : en préparation ;
 * - PENDING : produit d'un vendeur en attente de modération (BR-003, S6-T02) ;
 * - REJECTED : refusé par la modération (motif montré au vendeur) ;
 * - ARCHIVED : désactivé, jamais supprimé s'il a des commandes (BR-002).
 */
export const PRODUCT_STATUSES = ["DRAFT", "PUBLISHED", "ARCHIVED", "PENDING", "REJECTED"] as const;
export type ProductStatus = (typeof PRODUCT_STATUSES)[number];

export const MAX_VARIANTS = 50;
export const MAX_IMAGES = 10;
export const MAX_ORDER_QUANTITY = 99;

export interface VariantProps {
  id: string;
  /** Référence interne unique (étiquette, inventaire). */
  sku: string;
  /** Libellé affiché (« Noir · 128 Go »). */
  name: string;
  /** Caractéristiques qui distinguent la variante (FR-013) : { couleur: "Noir", taille: "M" }. */
  attributes: Readonly<Record<string, string>>;
  price: number;
  /** Prix barré ; s'il existe, il est forcément supérieur au prix. */
  compareAtPrice: number | null;
  stock: number;
  isActive: boolean;
  /** Déclinaison de la fiche commune (S7.5-T02) ; par défaut, l'identifiant de la variante (fiche d'une seule offre). */
  listingVariantId?: string;
}

export type Variant = Readonly<VariantProps> & { readonly listingVariantId: string };

export interface ProductProps {
  id: string;
  slug: string;
  title: string;
  description: string;
  brand: string | null;
  categoryId: string;
  images: readonly string[];
  status: ProductStatus;
  rating: number;
  reviewCount: number;
  isFeatured: boolean;
  isBestseller: boolean;
  isNew: boolean;
  variants: readonly VariantProps[];
  /** Boutique suspendue (S6-T02) : le produit est caché, quel que soit son statut. Faux par défaut. */
  shopSuspended?: boolean;
  /**
   * Offre d'une boutique sur une fiche commune (S7.5-T02, ADR-0049) : la fiche, son adresse (liens du site) et son
   * statut. Par défaut, la fiche porte l'identifiant et l'adresse de l'offre et elle est publiée.
   */
  listingId?: string;
  listingSlug?: string;
  listingPublished?: boolean;
  /** Boutique qui vend (S6-T01) ; par défaut, inconnue (chaîne vide). */
  shopId?: string;
}

/** Réponse à « puis-je commander N exemplaires de cette variante ? » (BR-001). */
export type Orderability =
  | { ok: true }
  | {
      ok: false;
      reason:
        "PRODUIT_INDISPONIBLE" | "VARIANTE_INCONNUE" | "QUANTITE_INVALIDE" | "STOCK_INSUFFISANT";
      /** Quantité disponible (seulement pour STOCK_INSUFFISANT). */
      available?: number;
    };

const SKU = /^[A-Z0-9][A-Z0-9-]{1,39}$/;
const ATTRIBUTE_KEY = /^[a-z][a-z0-9-]{0,29}$/;

function createVariant(props: VariantProps): Variant {
  const price = assertPrice(props.price, `variante ${props.sku} : prix`);
  const compareAtPrice =
    props.compareAtPrice === null
      ? null
      : assertPrice(props.compareAtPrice, `variante ${props.sku} : prix barré`);
  if (compareAtPrice !== null && compareAtPrice <= price) {
    throw variant(`${props.sku} : le prix barré doit être supérieur au prix`);
  }
  if (!SKU.test(props.sku))
    throw variant(`référence « ${props.sku.slice(0, 40)} » : A-Z, 0-9 et tirets`);
  const attributes = Object.entries(props.attributes);
  if (attributes.length > 10) throw variant(`${props.sku} : 10 caractéristiques au plus`);
  for (const [key, value] of attributes) {
    if (
      !ATTRIBUTE_KEY.test(key) ||
      typeof value !== "string" ||
      !value.trim() ||
      value.length > 40
    ) {
      throw variant(`${props.sku} : caractéristique « ${key.slice(0, 30)} » invalide`);
    }
  }
  const id = assertUuid(props.id, "variante");
  return Object.freeze({
    id,
    listingVariantId: assertUuid(props.listingVariantId ?? id, "déclinaison"),
    sku: props.sku,
    name: requiredText(props.name, "nom de la variante", 80),
    attributes: Object.freeze(Object.fromEntries(attributes.map(([k, v]) => [k, v.trim()]))),
    price,
    compareAtPrice,
    stock: assertStock(props.stock),
    isActive: props.isActive,
  });
}

/**
 * Produit du catalogue et ses variantes (FR-013) : chaque variante a son prix et **son propre stock**.
 * Un produit a toujours au moins une variante (un produit « simple » en a exactement une).
 */
export class Product {
  readonly id: string;
  readonly slug: string;
  readonly title: string;
  readonly description: string;
  readonly brand: string | null;
  readonly categoryId: string;
  readonly images: readonly string[];
  readonly status: ProductStatus;
  readonly rating: number;
  readonly reviewCount: number;
  readonly isFeatured: boolean;
  readonly isBestseller: boolean;
  readonly isNew: boolean;
  readonly variants: readonly Variant[];
  readonly shopSuspended: boolean;
  readonly listingId: string;
  readonly listingSlug: string;
  readonly listingPublished: boolean;
  readonly shopId: string;

  private constructor(props: ProductProps) {
    this.id = assertUuid(props.id, "produit");
    this.slug = assertSlug(props.slug);
    this.title = requiredText(props.title, "titre", 120);
    this.description = props.description.trim().slice(0, 5_000);
    this.brand = props.brand === null ? null : requiredText(props.brand, "marque", 60);
    this.categoryId = assertUuid(props.categoryId, "catégorie du produit");
    if (props.images.length > MAX_IMAGES) throw invalid(`${MAX_IMAGES} images au plus`);
    this.images = Object.freeze(props.images.map(imagePath));
    if (!PRODUCT_STATUSES.includes(props.status))
      throw invalid(`statut « ${String(props.status)} » inconnu`);
    this.status = props.status;
    if (!(props.rating >= 0 && props.rating <= 5)) throw invalid("note : entre 0 et 5");
    this.rating = Math.round(props.rating * 10) / 10;
    if (!Number.isSafeInteger(props.reviewCount) || props.reviewCount < 0) {
      throw invalid("nombre d'avis : entier positif ou nul");
    }
    this.reviewCount = props.reviewCount;
    this.isFeatured = props.isFeatured;
    this.isBestseller = props.isBestseller;
    this.isNew = props.isNew;
    this.shopSuspended = props.shopSuspended ?? false;
    this.listingId = assertUuid(props.listingId ?? this.id, "fiche");
    this.listingSlug = props.listingSlug === undefined ? this.slug : assertSlug(props.listingSlug);
    this.listingPublished = props.listingPublished ?? true;
    this.shopId = props.shopId ?? "";

    if (props.variants.length === 0) throw invalid("au moins une variante");
    if (props.variants.length > MAX_VARIANTS) throw invalid(`${MAX_VARIANTS} variantes au plus`);
    this.variants = Object.freeze(props.variants.map(createVariant));
    const unique = (values: string[]) => new Set(values).size === values.length;
    if (!unique(this.variants.map((v) => v.id))) throw invalid("variantes en double");
    if (!unique(this.variants.map((v) => v.sku)))
      throw invalid("références de variantes en double");
    if (this.status === "PUBLISHED" && !this.variants.some((v) => v.isActive)) {
      throw invalid("un produit publié a au moins une variante active");
    }
  }

  /** Crée un produit en vérifiant toutes ses règles ; lève une `CatalogError` sinon. */
  static create(props: ProductProps): Product {
    return new Product(props);
  }

  /**
   * Visible des clients (fiche, listes, panier, commande) : offre publiée, boutique non suspendue ET fiche publiée
   * (S7.5-T02 : une fiche retirée par l'équipe cache toutes ses offres).
   */
  get isVisible(): boolean {
    return this.status === "PUBLISHED" && !this.shopSuspended && this.listingPublished;
  }

  private get activeVariants(): readonly Variant[] {
    return this.variants.filter((v) => v.isActive);
  }

  /** Variante affichée par défaut et utilisée pour le prix « à partir de » : la moins chère des actives. */
  get mainVariant(): Variant {
    const candidates = this.activeVariants.length ? this.activeVariants : this.variants;
    return candidates.reduce((best, v) => (v.price < best.price ? v : best));
  }

  /** Prix affiché en liste (le plus bas des variantes actives) — sert aussi au tri par prix. */
  get price(): number {
    return this.mainVariant.price;
  }

  get compareAtPrice(): number | null {
    return this.mainVariant.compareAtPrice;
  }

  get totalStock(): number {
    return this.activeVariants.reduce((sum, v) => sum + v.stock, 0);
  }

  /** BR-001 : visible comme « en stock » seulement s'il est publié et qu'une variante active a du stock. */
  get isAvailable(): boolean {
    return this.isVisible && this.activeVariants.some((v) => v.stock > 0);
  }

  /** Texte servant à la recherche : titre, marque, catégorie, caractéristiques (sans accents). */
  searchText(categoryName: string): string {
    const attributes = this.variants.flatMap((v) => Object.values(v.attributes));
    return searchable(
      [this.title, this.brand ?? "", categoryName, ...new Set(attributes)].join(" "),
    );
  }

  /**
   * BR-001 : un produit indisponible ou à stock nul ne peut être ni ajouté au panier, ni commandé.
   * (La réservation du stock, dans la même transaction que la commande, est la règle BR-012 du S5.)
   */
  checkOrderable(variantId: string, quantity: number): Orderability {
    if (!this.isVisible) return { ok: false, reason: "PRODUIT_INDISPONIBLE" };
    const variant = this.variants.find((v) => v.id === variantId);
    if (!variant) return { ok: false, reason: "VARIANTE_INCONNUE" };
    if (!variant.isActive) return { ok: false, reason: "PRODUIT_INDISPONIBLE" };
    if (!Number.isSafeInteger(quantity) || quantity < 1 || quantity > MAX_ORDER_QUANTITY) {
      return { ok: false, reason: "QUANTITE_INVALIDE" };
    }
    if (variant.stock === 0) return { ok: false, reason: "PRODUIT_INDISPONIBLE" };
    if (variant.stock < quantity) {
      return { ok: false, reason: "STOCK_INSUFFISANT", available: variant.stock };
    }
    return { ok: true };
  }
}

function invalid(message: string): CatalogError {
  return new CatalogError("PRODUIT_INVALIDE", message);
}

function variant(message: string): CatalogError {
  return new CatalogError("VARIANTE_INVALIDE", message);
}
