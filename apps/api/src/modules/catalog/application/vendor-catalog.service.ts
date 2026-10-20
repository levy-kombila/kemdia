import { Inject, Injectable } from "@nestjs/common";
// Boutique Kemdia (S6-T01) : ses produits ne passent jamais par la modération
import { KEMDIA_SHOP_ID, MAX_PENDING_PRODUCTS_PER_SHOP } from "@kemdia/contracts/constants";
import { CatalogError } from "../domain/catalog-error.js";
import { CategoryTree } from "../domain/category.js";
import {
  onOfferArchive,
  onOfferCreate,
  onOfferRestore,
  onOfferWithdraw,
  type Seller,
} from "../domain/listing.js";
import { Product, type ProductStatus } from "../domain/product.js";
import {
  assertRoomForImage,
  checkUpload,
  photoNotFound,
  reordered,
  vendorImageId,
  withAddedImage,
  withoutImage,
  type ImageSize,
  type ProcessedImage,
} from "../domain/product-image.js";
import {
  VENDOR_PRODUCT_RULES,
  moderate,
  onArchive,
  onContentChange,
  onCreate,
  onRestore,
  validateContent,
  validateReason,
  variantAttributes,
  variantName,
  vendorSlug,
  type ModerationDecision,
  type ModerationState,
  type VendorContentInput,
} from "../domain/vendor-product.js";
import { searchable } from "../domain/values.js";
import {
  CATALOG_RANDOM,
  CATEGORY_REPOSITORY,
  IMAGE_PROCESSOR,
  LISTING_REPOSITORY,
  PRODUCT_IMAGE_STORE,
  SELLER_DIRECTORY,
  VENDOR_PRODUCT_REPOSITORY,
  type CatalogRandom,
  type ListingCursor,
  type ListingRecord,
  type ListingRepository,
  type ListingVariantRecord,
  type SellerDirectory,
  type CategoryRepository,
  type ImageProcessor,
  type ProductImageStore,
  type StoredImage,
  type DerivedFields,
  type VendorProductCursor,
  type VendorProductRecord,
  type VendorProductRepository,
  type VendorVariantRecord,
} from "./ports.js";

export interface VendorVariantInput {
  name: string;
  attributes?: Readonly<Record<string, string>> | undefined;
  price: number;
  compareAtPrice?: number | null | undefined;
  stock: number;
}

export interface VendorProductInput extends VendorContentInput {
  variants: readonly VendorVariantInput[];
}

/** Ligne d'une offre sur une fiche existante (S7.5-T02) : une déclinaison de la fiche, un prix, un stock. */
export interface OfferLineInput {
  listingVariantId: string;
  price: number;
  compareAtPrice?: number | null | undefined;
  stock: number;
}

/** Correction d'une fiche par l'équipe : contenu et déclinaisons (renommées ou ajoutées, jamais retirées). */
export interface ListingEditInput {
  title?: string | undefined;
  description?: string | undefined;
  brand?: string | null | undefined;
  categoryId?: string | undefined;
  variants?:
    | readonly {
        id?: string | undefined;
        name: string;
        attributes?: Readonly<Record<string, string>> | undefined;
      }[]
    | undefined;
}

/** Changement libre d'une variante (sans nouvelle modération). */
export interface VendorVariantPatch {
  price?: number | undefined;
  compareAtPrice?: number | null | undefined;
  /** Nouveau stock disponible ; exige `previousStock`, le stock lu par le vendeur. */
  stock?: number | undefined;
  previousStock?: number | undefined;
  isActive?: boolean | undefined;
}

type Page = { items: VendorProductRecord[]; next: VendorProductCursor | null };

/** Essais d'adresse lisible avant d'abandonner (suffixe de 6 caractères : un doublon est déjà improbable). */
const SLUG_ATTEMPTS = 3;

const notFound = () => new CatalogError("PRODUIT_INTROUVABLE", "produit introuvable");
const listingNotFound = () => new CatalogError("FICHE_INTROUVABLE", "fiche introuvable");
const alreadySelling = () =>
  new CatalogError(
    "DEJA_EN_VENTE",
    "votre boutique vend déjà ce produit : modifiez votre offre existante",
  );
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Produits des vendeurs dans le catalogue (S6-T02, ADR-0033). Ce service ne décide d'AUCUN droit : il reçoit la
 * boutique (`shopId`) ou le modérateur déjà vérifiés par le module vendors, qui l'appelle dans sa transaction. Toutes
 * les écritures rejoignent cette transaction (boutique, produit et journal d'audit ensemble ou pas du tout).
 *
 * Un produit d'une autre boutique est « introuvable » pour un vendeur (jamais « interdit » : on ne confirme pas son
 * existence).
 */
@Injectable()
export class VendorCatalog {
  constructor(
    @Inject(VENDOR_PRODUCT_REPOSITORY) private readonly products: VendorProductRepository,
    @Inject(CATEGORY_REPOSITORY) private readonly categories: CategoryRepository,
    @Inject(CATALOG_RANDOM) private readonly random: CatalogRandom,
    @Inject(IMAGE_PROCESSOR) private readonly processor: ImageProcessor,
    @Inject(PRODUCT_IMAGE_STORE) private readonly images: ProductImageStore,
    @Inject(LISTING_REPOSITORY) private readonly listings: ListingRepository,
    @Inject(SELLER_DIRECTORY) private readonly sellers: SellerDirectory,
  ) {}

  async create(shopId: string, input: VendorProductInput, now: Date): Promise<VendorProductRecord> {
    const content = validateContent(input);
    const tree = await this.tree();
    const categoryName = this.requireCategory(tree, content.categoryId);
    await this.assertQueueRoom(shopId);
    if (input.variants.length < 1 || input.variants.length > VENDOR_PRODUCT_RULES.variantsMax) {
      throw new CatalogError(
        "PRODUIT_INVALIDE",
        `entre 1 et ${VENDOR_PRODUCT_RULES.variantsMax} variantes`,
      );
    }
    const prefix = this.random.skuPrefix();
    const variants: VendorVariantRecord[] = input.variants.map((v, index) => {
      const id = this.random.uuid();
      // Nouvelle fiche : une déclinaison par variante, même identifiant (S7.5-T02)
      return {
        id,
        listingVariantId: id,
        sku: `V${prefix}-${index + 1}`,
        name: variantName(v.name),
        attributes: variantAttributes(v.attributes ?? {}),
        price: v.price,
        compareAtPrice: v.compareAtPrice ?? null,
        stock: v.stock,
        isActive: true,
      };
    });
    assertDistinctNames(variants);
    for (let attempt = 0; attempt < SLUG_ATTEMPTS; attempt += 1) {
      const id = this.random.uuid();
      const slug = vendorSlug(searchable(content.title), this.random.slugSuffix(6));
      const moderation = onCreate(now);
      const record: VendorProductRecord = {
        id,
        shopId,
        // Fiche créée avec l'offre : même identifiant, même adresse ; elle suit l'offre jusqu'à sa publication
        listingId: id,
        listingSlug: slug,
        listingStatus: moderation.status,
        listingOwnerShopId: shopId,
        slug,
        ...content,
        images: [],
        ...moderation,
        shopSuspended: false,
        createdAt: now,
        updatedAt: now,
        variants,
      };
      if (await this.products.insert(record, derive(record, categoryName))) return record;
    }
    throw new Error("adresse de produit introuvable après plusieurs essais");
  }

  async get(shopId: string, productId: string): Promise<VendorProductRecord> {
    const record = await this.products.findById(productId);
    if (!record || record.shopId !== shopId) throw notFound();
    return record;
  }

  list(
    shopId: string,
    query: {
      status?: ProductStatus | undefined;
      limit: number;
      after?: VendorProductCursor | undefined;
    },
  ): Promise<Page> {
    return this.products.listForShop(shopId, query);
  }

  /** Titre, description, marque, catégorie : le produit repasse en modération. */
  async updateContent(
    shopId: string,
    productId: string,
    input: VendorContentInput,
    now: Date,
  ): Promise<{ before: VendorProductRecord; after: VendorProductRecord }> {
    const content = validateContent(input);
    const before = await this.lockOwned(shopId, productId);
    assertWritesListing(before);
    const tree = await this.tree();
    const categoryName = this.requireCategory(tree, content.categoryId);
    if (before.status !== "PENDING") await this.assertQueueRoom(shopId);
    const after: VendorProductRecord = {
      ...before,
      ...content,
      ...onContentChange(state(before), now),
      updatedAt: now,
    };
    await this.products.update(after, derive(after, categoryName));
    return { before, after };
  }

  /** Prix, prix barré, stock, activation d'une variante : sans nouvelle modération. */
  async updateVariant(
    shopId: string,
    productId: string,
    variantId: string,
    patch: VendorVariantPatch,
    now: Date,
  ): Promise<{ before: VendorVariantRecord; after: VendorProductRecord }> {
    const before = await this.lockOwned(shopId, productId);
    const id = variantId.toLowerCase();
    const current = before.variants.find((v) => v.id === id);
    if (!current) throw new CatalogError("VARIANTE_INTROUVABLE", "variante introuvable");
    if (patch.stock !== undefined && patch.previousStock !== current.stock) {
      // Lu sous verrou : une commande passée ou annulée entre-temps a changé le stock disponible
      throw new CatalogError(
        "STOCK_MODIFIE",
        `le stock disponible a changé entre-temps (${current.stock}) : vérifiez-le et recommencez`,
      );
    }
    const updated: VendorVariantRecord = {
      ...current,
      ...(patch.price !== undefined ? { price: patch.price } : {}),
      ...(patch.compareAtPrice !== undefined ? { compareAtPrice: patch.compareAtPrice } : {}),
      ...(patch.stock !== undefined ? { stock: patch.stock } : {}),
      ...(patch.isActive !== undefined ? { isActive: patch.isActive } : {}),
    };
    const after: VendorProductRecord = {
      ...before,
      updatedAt: now,
      variants: before.variants.map((v) => (v.id === id ? updated : v)),
    };
    // Quel que soit le statut : un produit sans variante active ne pourrait plus être validé (relecture S6-T02)
    if (!after.variants.some((v) => v.isActive)) {
      throw new CatalogError(
        "STATUT_PRODUIT_INCOMPATIBLE",
        "un produit garde au moins une variante active : archivez-le plutôt",
      );
    }
    const categoryName = (await this.tree()).byIdOrNull(after.categoryId)?.name ?? "";
    await this.products.update(after, derive(after, categoryName));
    return { before: current, after };
  }

  async archive(
    shopId: string,
    productId: string,
    now: Date,
  ): Promise<{ before: VendorProductRecord; after: VendorProductRecord }> {
    const before = await this.lockOwned(shopId, productId);
    // Offre sur une fiche publiée : une offre retirée par l'équipe ne s'archive pas (S7.5-T02)
    const next = onPublishedListing(before)
      ? onOfferArchive(state(before))
      : onArchive(state(before));
    const after = await this.write({ ...before, ...next, updatedAt: now });
    return { before, after };
  }

  /**
   * Remise en vente : nouvelle modération pour une fiche pas encore publiée ; sur une fiche publiée, l'offre archivée
   * revient en ligne tout de suite, l'offre retirée par l'équipe repasse par la modération (S7.5-T02).
   */
  async restore(shopId: string, productId: string, now: Date): Promise<VendorProductRecord> {
    const before = await this.lockOwned(shopId, productId);
    const next = onPublishedListing(before)
      ? onOfferRestore(state(before), now)
      : onRestore(state(before), now);
    if (next.status === "PENDING") await this.assertQueueRoom(shopId);
    return this.write({ ...before, ...next, updatedAt: now });
  }

  // --- Photos (S6-T04, ADR-0035) ---

  /**
   * Réencode un fichier reçu, HORS transaction (calcul de quelques centaines de millisecondes : aucun verrou n'est
   * gardé pendant ce temps). Le résultat est ensuite rangé par `addImage`.
   */
  prepareImage(bytes: Uint8Array): Promise<ProcessedImage> {
    checkUpload(bytes);
    return this.processor.process(bytes);
  }

  /**
   * Vérification rapide, SANS verrou, avant le réencodage (relecture S6-T04) : produit de la boutique, pas archivé,
   * place pour une photo. Évite de réencoder pour rien ; `addImage` revérifie tout sous verrou.
   */
  async checkImageRoom(shopId: string, productId: string, now: Date): Promise<void> {
    const product = await this.get(shopId, productId);
    assertWritesListing(product);
    onContentChange(state(product), now);
    assertRoomForImage(product.images);
  }

  /** Ajoute une photo (10 au plus) : le produit repasse en modération (choix du 2026-10-16, BR-003). */
  async addImage(
    shopId: string,
    productId: string,
    image: ProcessedImage,
    now: Date,
  ): Promise<{ before: VendorProductRecord; after: VendorProductRecord; imageId: string }> {
    const before = await this.lockOwned(shopId, productId);
    assertWritesListing(before);
    const imageId = this.random.uuid();
    const images = withAddedImage(before.images, imageId);
    const next = onContentChange(state(before), now);
    if (before.status !== "PENDING") await this.assertQueueRoom(shopId);
    await this.images.save(imageId, before.id, image, now);
    const after = await this.write({ ...before, images, ...next, updatedAt: now });
    return { before, after, imageId };
  }

  /** Retire une photo : tout de suite, sans nouvelle modération ; elle est effacée (plus jamais servie). */
  async removeImage(
    shopId: string,
    productId: string,
    imageId: string,
    now: Date,
  ): Promise<{ after: VendorProductRecord; sha256: string | null }> {
    const before = await this.lockOwned(shopId, productId);
    assertWritesListing(before);
    const images = withoutImage(before.images, imageId);
    const id = imageId.toLowerCase();
    // Empreinte gardée au journal : une photo illicite retirée laisse une trace (relecture S6-T04)
    const sha256 = (await this.images.describe(id))?.sha256 ?? null;
    const after = await this.write({ ...before, images, updatedAt: now });
    await this.images.delete(id, before.id);
    return { after, sha256 };
  }

  /** Nouvel ordre des photos (la première est la principale) : sans nouvelle modération. */
  async reorderImages(
    shopId: string,
    productId: string,
    imageIds: readonly string[],
    now: Date,
  ): Promise<VendorProductRecord> {
    const before = await this.lockOwned(shopId, productId);
    assertWritesListing(before);
    const images = reordered(before.images, imageIds);
    return this.write({ ...before, images, updatedAt: now });
  }

  /** Photo d'un produit de la boutique (le vendeur la voit quel que soit le statut du produit). */
  async ownImage(
    shopId: string,
    productId: string,
    imageId: string,
    size: ImageSize,
  ): Promise<StoredImage> {
    const product = await this.get(shopId, productId);
    return this.imageOf(product, imageId, size);
  }

  /**
   * Photo servie à TOUS (site) : seulement si son produit est visible des clients (validé, boutique non suspendue) et
   * qu'elle est encore dans sa liste. Une photo en attente de modération n'est jamais publique : on ne peut pas se
   * servir de Kemdia pour héberger une image non modérée.
   */
  async publicImage(imageId: string, size: ImageSize): Promise<StoredImage> {
    const id = imageId.toLowerCase();
    // Produit vérifié AVANT de lire les octets : une photo non publique ne coûte qu'une petite lecture
    const owner = await this.images.describe(id);
    if (!owner) throw photoNotFound();
    // Photo de la FICHE (S7.5-T02) : rangée avec l'offre de la boutique qui l'a créée ; servie tant que la fiche est
    // publiée et visible (au moins une offre visible), même si cette offre-là n'est plus en vente
    const product = await this.products.findById(owner.productId);
    if (!product) throw photoNotFound();
    const listing = await this.listings.findById(product.listingId);
    if (!listing || listing.status !== "PUBLISHED" || listing.offerCount < 1) throw photoNotFound();
    if (listing.id !== product.id) throw photoNotFound();
    // Retirée de la liste (en cours d'effacement) : plus servie
    if (!listing.images.some((path) => vendorImageId(path) === id)) throw photoNotFound();
    const stored = await this.images.read(id, size);
    if (!stored || stored.productId !== product.id) throw photoNotFound();
    return stored;
  }

  /** Photo d'un produit de vendeur, pour la modération (quel que soit son statut). */
  async moderationImage(productId: string, imageId: string, size: ImageSize): Promise<StoredImage> {
    const product = await this.moderationGet(productId);
    return this.imageOf(product, imageId, size);
  }

  // --- Modération ---

  moderationQueue(query: {
    status: ProductStatus;
    limit: number;
    after?: VendorProductCursor | undefined;
  }): Promise<Page> {
    return this.products.moderationQueue(query);
  }

  async moderationGet(productId: string): Promise<VendorProductRecord> {
    const record = await this.products.findById(productId);
    if (!record || record.shopId === KEMDIA_SHOP_ID) throw notFound();
    return record;
  }

  /** Verrouille le produit (dans la transaction de l'appelant) avant de vérifier qui peut décider. */
  async lockForModeration(productId: string): Promise<VendorProductRecord> {
    const record = await this.products.lockById(productId);
    if (!record || record.shopId === KEMDIA_SHOP_ID) throw notFound();
    return record;
  }

  /** Décision sur un produit déjà verrouillé par `lockForModeration`. */
  async moderate(
    record: VendorProductRecord,
    decision: ModerationDecision,
    by: { moderatorId: string; reason: string | null; now: Date; seenSubmittedAt: Date },
  ): Promise<VendorProductRecord> {
    return this.write({ ...record, ...moderate(state(record), decision, by), updatedAt: by.now });
  }

  /** Boutique suspendue ou réactivée (module vendors) : ses produits sont cachés ou montrés à nouveau. */
  setShopSuspended(shopId: string, suspended: boolean): Promise<number> {
    return this.products.setShopSuspended(shopId, suspended);
  }

  /** Nom, adresse et ville de la boutique, montrés à côté de ses offres (module vendors, S7.5-T02). */
  syncSeller(shopId: string, seller: Seller): Promise<void> {
    return this.sellers.save(shopId, seller);
  }

  // --- Fiches communes et offres (S7.5-T02, ADR-0049) ---

  /**
   * Fiches publiées qui correspondent à la recherche du vendeur (avant de créer une nouvelle fiche), avec l'offre de sa
   * boutique s'il en a déjà une.
   */
  async searchListings(
    shopId: string,
    q: string,
    limit: number,
  ): Promise<{ listing: ListingRecord; myOfferId: string | null }[]> {
    const terms = [...new Set(searchable(q.slice(0, 100)).split(" ").filter(Boolean))].slice(0, 8);
    if (!terms.length) return [];
    const listings = await this.listings.searchPublished(terms, limit);
    const result: { listing: ListingRecord; myOfferId: string | null }[] = [];
    for (const listing of listings) {
      result.push({
        listing,
        myOfferId: (await this.products.findOffer(listing.id, shopId))?.id ?? null,
      });
    }
    return result;
  }

  /**
   * Offre de la boutique sur une fiche publiée : en ligne tout de suite (choix du 2026-10-20). Une boutique a au plus
   * une offre par fiche ; chaque ligne désigne une déclinaison de la fiche.
   */
  async createOffer(
    shopId: string,
    listingId: string,
    lines: readonly OfferLineInput[],
    now: Date,
  ): Promise<VendorProductRecord> {
    // Fiche verrouillée (relecture S7.5-T02) : une fusion ou une correction en cours finit d'abord, et deux offres
    // simultanées de la même boutique passent l'une après l'autre
    const listing = await this.lockListing(listingId);
    if (listing.mergedIntoId) throw listingNotFound();
    if (listing.status !== "PUBLISHED") {
      throw new CatalogError("FICHE_NON_PUBLIEE", "cette fiche n'est pas en ligne");
    }
    if (await this.products.findOffer(listing.id, shopId)) throw alreadySelling();
    if (lines.length < 1 || lines.length > VENDOR_PRODUCT_RULES.variantsMax) {
      throw new CatalogError(
        "PRODUIT_INVALIDE",
        `entre 1 et ${VENDOR_PRODUCT_RULES.variantsMax} déclinaisons`,
      );
    }
    const prefix = this.random.skuPrefix();
    const variants = lines.map((line, index) =>
      this.offerVariant(listing, line, `V${prefix}-${index + 1}`),
    );
    if (new Set(variants.map((v) => v.listingVariantId)).size !== variants.length) {
      throw new CatalogError("VARIANTE_INVALIDE", "deux lignes désignent la même déclinaison");
    }
    const categoryName = (await this.tree()).byIdOrNull(listing.categoryId)?.name ?? "";
    for (let attempt = 0; attempt < SLUG_ATTEMPTS; attempt += 1) {
      const slug = vendorSlug(searchable(listing.title), this.random.slugSuffix(6));
      const record: VendorProductRecord = {
        id: this.random.uuid(),
        shopId,
        listingId: listing.id,
        listingSlug: listing.slug,
        listingStatus: listing.status,
        listingOwnerShopId: listing.createdByShopId,
        slug,
        title: listing.title,
        description: listing.description,
        brand: listing.brand,
        categoryId: listing.categoryId,
        images: [...listing.images],
        ...onOfferCreate(),
        shopSuspended: false,
        createdAt: now,
        updatedAt: now,
        variants,
      };
      if (await this.products.insert(record, derive(record, categoryName))) return record;
      // Refus d'unicité : l'adresse… ou une offre de la boutique arrivée entre-temps (relecture S7.5-T02)
      if (await this.products.findOffer(listing.id, shopId)) throw alreadySelling();
    }
    throw new Error("adresse d'offre introuvable après plusieurs essais");
  }

  /** Ajoute à l'offre une déclinaison de sa fiche qu'elle ne proposait pas encore. */
  async addOfferVariant(
    shopId: string,
    productId: string,
    line: OfferLineInput,
    now: Date,
  ): Promise<VendorProductRecord> {
    const before = await this.lockOwned(shopId, productId);
    if (before.status === "ARCHIVED") {
      throw new CatalogError("STATUT_PRODUIT_INCOMPATIBLE", "remettez d'abord l'offre en vente");
    }
    if (before.variants.length >= VENDOR_PRODUCT_RULES.variantsMax) {
      throw new CatalogError(
        "PRODUIT_INVALIDE",
        `${VENDOR_PRODUCT_RULES.variantsMax} déclinaisons au plus`,
      );
    }
    const listing = await this.listings.findById(before.listingId);
    if (!listing) throw listingNotFound();
    const variant = this.offerVariant(
      listing,
      line,
      `V${this.random.skuPrefix()}-${before.variants.length + 1}`,
    );
    if (before.variants.some((v) => v.listingVariantId === variant.listingVariantId)) {
      throw new CatalogError("VARIANTE_INVALIDE", "votre offre propose déjà cette déclinaison");
    }
    const after: VendorProductRecord = {
      ...before,
      updatedAt: now,
      variants: [...before.variants, variant],
    };
    // Règles du domaine vérifiées AVANT d'écrire (prix, prix barré, stock)
    const derived = derive(after, (await this.tree()).byIdOrNull(after.categoryId)?.name ?? "");
    await this.products.insertVariant(before.id, variant, before.variants.length);
    await this.products.update(after, derived);
    return after;
  }

  // --- Fiches communes : l'équipe (S7.5-T02) ---

  listListings(query: {
    q?: string | undefined;
    status?: ProductStatus | undefined;
    limit: number;
    after?: ListingCursor | undefined;
  }): Promise<{ items: ListingRecord[]; next: ListingCursor | null }> {
    const terms = [
      ...new Set(
        searchable((query.q ?? "").slice(0, 100))
          .split(" ")
          .filter(Boolean),
      ),
    ].slice(0, 8);
    return this.listings.list({
      terms,
      status: query.status,
      limit: query.limit,
      after: query.after,
    });
  }

  /** Fiche et toutes ses offres (tous statuts), pour l'équipe. */
  async listingWithOffers(
    listingId: string,
  ): Promise<{ listing: ListingRecord; offers: VendorProductRecord[] }> {
    if (!UUID.test(listingId)) throw listingNotFound();
    const listing = await this.listings.findById(listingId.toLowerCase());
    if (!listing) throw listingNotFound();
    return { listing, offers: await this.products.listForListing(listing.id) };
  }

  /**
   * Correction d'une fiche par l'équipe : contenu (vérifié comme celui d'un vendeur) et déclinaisons (renommées ou
   * ajoutées). Recopié sur toutes les offres par la base. Sans nouvelle modération : c'est l'équipe qui écrit.
   */
  async editListing(
    listingId: string,
    input: ListingEditInput,
    now: Date,
  ): Promise<{ before: ListingRecord; after: ListingRecord }> {
    const before = await this.lockListing(listingId);
    if (before.mergedIntoId) {
      throw new CatalogError(
        "FICHE_INTROUVABLE",
        "fiche fusionnée : corrigez la fiche qui la remplace",
      );
    }
    const content = validateContent({
      title: input.title ?? before.title,
      description: input.description ?? before.description,
      brand: input.brand === undefined ? before.brand : input.brand,
      categoryId: input.categoryId ?? before.categoryId,
    });
    const tree = await this.tree();
    const categoryName = this.requireCategory(tree, content.categoryId);
    let variants: ListingVariantRecord[] = [...before.variants];
    for (const change of input.variants ?? []) {
      const name = variantName(change.name);
      const attributes = variantAttributes(change.attributes ?? {});
      if (change.id === undefined) {
        variants.push({ id: this.random.uuid(), name, attributes, position: variants.length });
        continue;
      }
      const id = change.id.toLowerCase();
      if (!variants.some((v) => v.id === id)) {
        throw new CatalogError(
          "DECLINAISON_INTROUVABLE",
          "déclinaison introuvable sur cette fiche",
        );
      }
      variants = variants.map((v) => (v.id === id ? { ...v, name, attributes } : v));
    }
    if (variants.length > 50) throw new CatalogError("PRODUIT_INVALIDE", "50 déclinaisons au plus");
    const names = variants.map((v) => v.name.toLowerCase());
    if (new Set(names).size !== names.length) {
      throw new CatalogError("VARIANTE_INVALIDE", "deux déclinaisons portent le même nom");
    }
    const after: ListingRecord = { ...before, ...content, variants, updatedAt: now };
    for (const variant of variants) {
      const old = before.variants.find((v) => v.id === variant.id);
      if (
        !old ||
        old.name !== variant.name ||
        !sameAttributes(old.attributes, variant.attributes)
      ) {
        await this.listings.saveVariant(before.id, variant, now);
      }
    }
    await this.listings.updateContent(after, listingSearchText(after, categoryName), now);
    return { before, after };
  }

  /** Retire une photo d'une fiche (équipe) : plus jamais servie, effacée. Empreinte rendue pour le journal. */
  async removeListingImage(
    listingId: string,
    imageId: string,
    now: Date,
  ): Promise<{ after: ListingRecord; sha256: string | null }> {
    const before = await this.lockListing(listingId);
    if (before.mergedIntoId) {
      throw new CatalogError(
        "FICHE_INTROUVABLE",
        "fiche fusionnée : corrigez la fiche qui la remplace",
      );
    }
    const images = withoutImage(before.images, imageId);
    const id = imageId.toLowerCase();
    const sha256 = (await this.images.describe(id))?.sha256 ?? null;
    const after: ListingRecord = { ...before, images, updatedAt: now };
    const categoryName = (await this.tree()).byIdOrNull(after.categoryId)?.name ?? "";
    await this.listings.updateContent(after, listingSearchText(after, categoryName), now);
    // Rangée avec l'offre de la boutique qui a créé la fiche (même identifiant que la fiche)
    await this.images.delete(id, before.id);
    return { after, sha256 };
  }

  /**
   * Fusion d'un doublon dans une fiche publiée (équipe). Chaque déclinaison du doublon utilisée par une offre doit être
   * associée à une déclinaison de la cible ; une boutique qui vend déjà sur la cible bloque la fusion (une offre par
   * boutique et par fiche). Les paniers et les commandes ne changent pas (mêmes variantes d'offre).
   */
  async mergeListings(
    sourceId: string,
    targetId: string,
    variantMap: Readonly<Record<string, string>>,
    now: Date,
    moderatorId: string,
  ): Promise<{ source: ListingRecord; target: ListingRecord; moved: number }> {
    if (!UUID.test(sourceId) || !UUID.test(targetId)) throw listingNotFound();
    const from = sourceId.toLowerCase();
    const to = targetId.toLowerCase();
    if (from === to)
      throw new CatalogError("FUSION_IMPOSSIBLE", "une fiche ne se fusionne pas avec elle-même");
    // Verrous dans l'ordre des identifiants : deux fusions croisées ne s'interbloquent pas
    const [first, second] = from < to ? [from, to] : [to, from];
    const locked = new Map<string, ListingRecord>();
    for (const id of [first, second]) locked.set(id, await this.lockListing(id));
    const source = locked.get(from)!;
    const target = locked.get(to)!;
    if (source.mergedIntoId || target.mergedIntoId) {
      throw new CatalogError("FUSION_IMPOSSIBLE", "l'une des fiches a déjà été fusionnée");
    }
    if (target.status !== "PUBLISHED") {
      throw new CatalogError("FUSION_IMPOSSIBLE", "la fiche cible doit être en ligne");
    }
    const [sourceOffers, targetOffers] = [
      await this.products.listForListing(source.id),
      await this.products.listForListing(target.id),
    ];
    const targetShops = new Set(targetOffers.map((o) => o.shopId));
    if (sourceOffers.some((o) => targetShops.has(o.shopId))) {
      throw new CatalogError(
        "FUSION_IMPOSSIBLE",
        "une boutique vend sur les deux fiches : demandez-lui d'archiver l'une de ses offres",
      );
    }
    const map = new Map<string, string>();
    for (const [key, value] of Object.entries(variantMap)) {
      const k = key.toLowerCase();
      const v = value.toLowerCase();
      if (!source.variants.some((x) => x.id === k) || !target.variants.some((x) => x.id === v)) {
        throw new CatalogError(
          "DECLINAISON_INTROUVABLE",
          "déclinaison inconnue dans la correspondance",
        );
      }
      map.set(k, v);
    }
    for (const offer of sourceOffers) {
      const targets = offer.variants.map((variant) => map.get(variant.listingVariantId));
      if (targets.some((t) => t === undefined)) {
        throw new CatalogError(
          "FUSION_IMPOSSIBLE",
          "chaque déclinaison vendue doit correspondre à une déclinaison de la fiche cible",
        );
      }
      if (new Set(targets).size !== targets.length) {
        throw new CatalogError(
          "FUSION_IMPOSSIBLE",
          "deux variantes d'une même offre iraient sur la même déclinaison",
        );
      }
    }
    await this.listings.merge(source.id, target.id, map, now);
    // Relecture S7.5-T02 : une offre déplacée qui n'est pas en ligne (refusée, archivée, en attente) ne doit pas
    // revenir en ligne sans modération sur la fiche cible (où la remise en vente serait immédiate)
    for (const offer of sourceOffers.filter((o) => o.status !== "PUBLISHED")) {
      const moved = await this.products.lockById(offer.id);
      if (!moved) continue;
      const next =
        moved.shopId === KEMDIA_SHOP_ID
          ? { ...state(moved), status: "ARCHIVED" as const, moderationReason: null }
          : {
              status: "REJECTED" as const,
              moderationReason:
                "Fiche fusionnée : votre offre repasse par la modération avant de revenir en vente",
              submittedAt: moved.submittedAt,
              reviewedBy: moderatorId,
              reviewedAt: now,
            };
      await this.write({ ...moved, ...next, updatedAt: now });
    }
    return { source, target, moved: sourceOffers.length };
  }

  /** Verrouille une offre pour son retrait par l'équipe. */
  async lockOffer(productId: string): Promise<VendorProductRecord> {
    if (!UUID.test(productId)) throw notFound();
    const record = await this.products.lockById(productId.toLowerCase());
    if (!record) throw notFound();
    return record;
  }

  /** Retrait d'une offre par l'équipe (prix abusif, contrefaçon…) : motif montré au vendeur, au journal. */
  async withdrawOffer(
    record: VendorProductRecord,
    by: { moderatorId: string; reason: string; now: Date },
  ): Promise<VendorProductRecord> {
    const next = onOfferWithdraw(state(record), {
      moderatorId: by.moderatorId,
      reason: validateReason(by.reason),
      now: by.now,
      kemdia: record.shopId === KEMDIA_SHOP_ID,
    });
    return this.write({ ...record, ...next, updatedAt: by.now });
  }

  /**
   * File de modération bornée par boutique (relecture S6-T02). Limite souple : deux envois simultanés du même vendeur
   * peuvent la dépasser d'une unité, sans conséquence.
   */
  private async assertQueueRoom(shopId: string): Promise<void> {
    if ((await this.products.countPending(shopId)) >= MAX_PENDING_PRODUCTS_PER_SHOP) {
      throw new CatalogError(
        "TROP_DE_PRODUITS_EN_ATTENTE",
        `${MAX_PENDING_PRODUCTS_PER_SHOP} produits attendent déjà la modération : patientez avant d'en envoyer d'autres`,
      );
    }
  }

  /** La photo doit être rangée ET encore dans la liste du produit (une photo retirée n'est plus servie). */
  private async imageOf(
    product: VendorProductRecord,
    imageId: string,
    size: ImageSize,
  ): Promise<StoredImage> {
    const id = imageId.toLowerCase();
    if (!product.images.some((path) => vendorImageId(path) === id)) throw photoNotFound();
    const stored = await this.images.read(id, size);
    if (!stored || stored.productId !== product.id) throw photoNotFound();
    return stored;
  }

  private async lockListing(listingId: string): Promise<ListingRecord> {
    if (!UUID.test(listingId)) throw listingNotFound();
    const listing = await this.listings.lockById(listingId.toLowerCase());
    if (!listing) throw listingNotFound();
    return listing;
  }

  /** Variante d'une offre sur une déclinaison existante de la fiche (nom et caractéristiques de la déclinaison). */
  private offerVariant(
    listing: ListingRecord,
    line: OfferLineInput,
    sku: string,
  ): VendorVariantRecord {
    const declinaison = listing.variants.find((v) => v.id === line.listingVariantId.toLowerCase());
    if (!declinaison) {
      throw new CatalogError("DECLINAISON_INTROUVABLE", "déclinaison introuvable sur cette fiche");
    }
    return {
      id: this.random.uuid(),
      listingVariantId: declinaison.id,
      sku,
      name: declinaison.name,
      attributes: { ...declinaison.attributes },
      price: line.price,
      compareAtPrice: line.compareAtPrice ?? null,
      stock: line.stock,
      isActive: true,
    };
  }

  private async lockOwned(shopId: string, productId: string): Promise<VendorProductRecord> {
    const record = await this.products.lockById(productId);
    if (!record || record.shopId !== shopId) throw notFound();
    return record;
  }

  private async write(record: VendorProductRecord): Promise<VendorProductRecord> {
    const categoryName = (await this.tree()).byIdOrNull(record.categoryId)?.name ?? "";
    await this.products.update(record, derive(record, categoryName));
    // Même règle que la base (déclencheur) : avant sa publication, la fiche suit l'offre de la boutique qui l'a créée
    const follows =
      record.listingOwnerShopId === record.shopId && record.listingStatus !== "PUBLISHED";
    return follows ? { ...record, listingStatus: record.status } : record;
  }

  private async tree(): Promise<CategoryTree> {
    return new CategoryTree(await this.categories.findAll());
  }

  private requireCategory(tree: CategoryTree, categoryId: string): string {
    const category = tree.byIdOrNull(categoryId);
    if (!category) throw new CatalogError("CATEGORIE_INCONNUE", "catégorie inconnue");
    return category.name;
  }
}

function state(record: VendorProductRecord): ModerationState {
  return {
    status: record.status,
    moderationReason: record.moderationReason,
    submittedAt: record.submittedAt,
    reviewedBy: record.reviewedBy,
    reviewedAt: record.reviewedAt,
  };
}

/** L'offre est-elle posée sur une fiche déjà publiée (statut de l'offre indépendant de la fiche) ? */
function onPublishedListing(record: VendorProductRecord): boolean {
  return record.listingStatus === "PUBLISHED";
}

/**
 * Le vendeur n'écrit le contenu (titre, description, photos…) que d'une fiche qu'il a créée et qui n'est pas encore
 * publiée (choix du 2026-10-20) ; ensuite, c'est l'équipe qui la corrige.
 */
function assertWritesListing(record: VendorProductRecord): void {
  if (record.listingOwnerShopId !== record.shopId || record.listingStatus === "PUBLISHED") {
    throw new CatalogError(
      "FICHE_PUBLIEE",
      "la fiche de ce produit est en ligne : seule l'équipe Kemdia peut la modifier (proposez-lui une correction)",
    );
  }
}

function sameAttributes(
  a: Readonly<Record<string, string>>,
  b: Readonly<Record<string, string>>,
): boolean {
  const ka = Object.keys(a);
  return ka.length === Object.keys(b).length && ka.every((k) => a[k] === b[k]);
}

/** Texte de recherche d'une fiche : titre, marque, catégorie, caractéristiques des déclinaisons (sans accents). */
function listingSearchText(listing: ListingRecord, categoryName: string): string {
  const attributes = listing.variants.flatMap((v) => Object.values(v.attributes));
  return searchable(
    [listing.title, listing.brand ?? "", categoryName, ...new Set(attributes)].join(" "),
  );
}

function assertDistinctNames(variants: readonly VendorVariantRecord[]): void {
  const names = variants.map((v) => v.name.toLowerCase());
  if (new Set(names).size !== names.length) {
    throw new CatalogError("VARIANTE_INVALIDE", "deux variantes portent le même nom");
  }
}

/**
 * Vérifie TOUTES les règles d'un produit du catalogue (prix, stock, références, caractéristiques…) en le construisant
 * avec le domaine, puis calcule le prix « à partir de » et le texte de recherche.
 */
function derive(record: VendorProductRecord, categoryName: string): DerivedFields {
  const product = Product.create({
    id: record.id,
    slug: record.slug,
    title: record.title,
    description: record.description,
    brand: record.brand,
    categoryId: record.categoryId,
    images: record.images,
    status: record.status,
    rating: 0,
    reviewCount: 0,
    isFeatured: false,
    isBestseller: false,
    isNew: false,
    shopSuspended: record.shopSuspended,
    variants: record.variants.map((v) => ({ ...v })),
  });
  return {
    price: product.price,
    compareAtPrice: product.compareAtPrice,
    searchText: product.searchText(categoryName),
  };
}
