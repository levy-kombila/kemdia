import { Inject, Injectable } from "@nestjs/common";
// Boutique Kemdia (S6-T01) : ses produits ne passent jamais par la modération
import { KEMDIA_SHOP_ID, MAX_PENDING_PRODUCTS_PER_SHOP } from "@kemdia/contracts/constants";
import { CatalogError } from "../domain/catalog-error.js";
import { CategoryTree } from "../domain/category.js";
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
  PRODUCT_IMAGE_STORE,
  VENDOR_PRODUCT_REPOSITORY,
  type CatalogRandom,
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
    const variants: VendorVariantRecord[] = input.variants.map((v, index) => ({
      id: this.random.uuid(),
      sku: `V${prefix}-${index + 1}`,
      name: variantName(v.name),
      attributes: variantAttributes(v.attributes ?? {}),
      price: v.price,
      compareAtPrice: v.compareAtPrice ?? null,
      stock: v.stock,
      isActive: true,
    }));
    assertDistinctNames(variants);
    for (let attempt = 0; attempt < SLUG_ATTEMPTS; attempt += 1) {
      const record: VendorProductRecord = {
        id: this.random.uuid(),
        shopId,
        slug: vendorSlug(searchable(content.title), this.random.slugSuffix(6)),
        ...content,
        images: [],
        ...onCreate(now),
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
    const after = await this.write({ ...before, ...onArchive(state(before)), updatedAt: now });
    return { before, after };
  }

  /** Remise en vente d'un produit archivé : nouvelle modération. */
  async restore(shopId: string, productId: string, now: Date): Promise<VendorProductRecord> {
    const before = await this.lockOwned(shopId, productId);
    const next = onRestore(state(before), now);
    await this.assertQueueRoom(shopId);
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
    const product = await this.products.findById(owner.productId);
    if (!product || product.status !== "PUBLISHED" || product.shopSuspended) throw photoNotFound();
    // Retirée de la liste (en cours d'effacement) : plus servie
    if (!product.images.some((path) => vendorImageId(path) === id)) throw photoNotFound();
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

  private async lockOwned(shopId: string, productId: string): Promise<VendorProductRecord> {
    const record = await this.products.lockById(productId);
    if (!record || record.shopId !== shopId) throw notFound();
    return record;
  }

  private async write(record: VendorProductRecord): Promise<VendorProductRecord> {
    const categoryName = (await this.tree()).byIdOrNull(record.categoryId)?.name ?? "";
    await this.products.update(record, derive(record, categoryName));
    return record;
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
    variants: record.variants,
  });
  return {
    price: product.price,
    compareAtPrice: product.compareAtPrice,
    searchText: product.searchText(categoryName),
  };
}
