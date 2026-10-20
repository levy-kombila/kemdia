import { Inject, Injectable } from "@nestjs/common";
import { AuditLog, type AuditContext } from "../../audit/index.js";
import {
  VendorCatalog,
  type ImageSize,
  type StoredImage,
  type VendorProductCursor,
  type ListingRecord,
  type OfferLineInput,
  type VendorProductInput,
  type VendorProductRecord,
  type VendorVariantPatch,
} from "../../catalog/index.js";
import type { Shop } from "../domain/shop.js";
import { VendorsError } from "../domain/vendors-error.js";
import {
  SHOP_REPOSITORY,
  VENDORS_TRANSACTION,
  type ShopRepository,
  type VendorsTransaction,
} from "./ports.js";

export type VendorProductStatus = VendorProductRecord["status"];

/** Le catalogue, vu par les produits des vendeurs (remplaçable dans les tests). */
export type VendorCatalogPort = Pick<
  VendorCatalog,
  | "create"
  | "get"
  | "list"
  | "updateContent"
  | "updateVariant"
  | "archive"
  | "restore"
  | "prepareImage"
  | "addImage"
  | "removeImage"
  | "reorderImages"
  | "ownImage"
  | "checkImageRoom"
  | "searchListings"
  | "createOffer"
  | "addOfferVariant"
>;

const inactive = () =>
  new VendorsError(
    "BOUTIQUE_INACTIVE",
    "votre boutique n'est pas active : vous ne pouvez pas gérer de produits pour l'instant",
  );

/** Longueur maximale d'un détail du journal d'audit (MAX_DETAIL_LENGTH du module audit). */
const AUDIT_DETAIL_MAX = 100;
export const shortText = (text: string) => {
  const line = text.replace(/\s+/g, " ");
  return line.length <= AUDIT_DETAIL_MAX ? line : `${line.slice(0, AUDIT_DETAIL_MAX - 1)}…`;
};

/**
 * Produits d'un vendeur (S6-T02, ADR-0033 ; BR-003, FR-002). Toute opération exige une boutique ACTIVE appartenant au
 * compte connecté, relue sous verrou partagé dans la transaction : une suspension attend la fin de l'écriture, et un
 * vendeur suspendu entre-temps ne peut plus rien écrire. Le rôle « vendor » est vérifié en plus par la route.
 *
 * Chaque envoi en modération (création, contenu modifié, remise en vente) est inscrit au journal d'audit.
 */
@Injectable()
export class VendorProductService {
  /** Horloge (remplaçable dans les tests). */
  clock: () => Date = () => new Date();

  constructor(
    @Inject(SHOP_REPOSITORY) private readonly shops: ShopRepository,
    @Inject(VENDORS_TRANSACTION) private readonly tx: VendorsTransaction,
    @Inject(AuditLog) private readonly audit: Pick<AuditLog, "record">,
    @Inject(VendorCatalog) private readonly catalog: VendorCatalogPort,
  ) {}

  create(
    accountId: string,
    input: VendorProductInput,
    context: AuditContext,
  ): Promise<VendorProductRecord> {
    return this.inShop(accountId, async (shop) => {
      const product = await this.catalog.create(shop.id, input, this.clock());
      await this.submitted(accountId, product, "creation", context);
      return product;
    });
  }

  list(
    accountId: string,
    query: {
      status?: VendorProductStatus | undefined;
      limit: number;
      after?: VendorProductCursor | undefined;
    },
  ): Promise<{ items: VendorProductRecord[]; next: VendorProductCursor | null }> {
    return this.inShop(accountId, (shop) => this.catalog.list(shop.id, query));
  }

  get(accountId: string, productId: string): Promise<VendorProductRecord> {
    return this.inShop(accountId, (shop) => this.catalog.get(shop.id, productId));
  }

  updateContent(
    accountId: string,
    productId: string,
    input: Omit<VendorProductInput, "variants">,
    context: AuditContext,
  ): Promise<VendorProductRecord> {
    return this.inShop(accountId, async (shop) => {
      const { before, after } = await this.catalog.updateContent(
        shop.id,
        productId,
        input,
        this.clock(),
      );
      await this.submitted(accountId, after, "modification", context, before.status);
      return after;
    });
  }

  /** Prix, stock, activation : sans modération, mais tracé (litige, arnaque au prix — relecture S6-T02). */
  updateVariant(
    accountId: string,
    productId: string,
    variantId: string,
    patch: VendorVariantPatch,
    context: AuditContext,
  ): Promise<VendorProductRecord> {
    return this.inShop(accountId, async (shop) => {
      const { before, after } = await this.catalog.updateVariant(
        shop.id,
        productId,
        variantId,
        patch,
        this.clock(),
      );
      const updated = after.variants.find((v) => v.id === before.id)!;
      const changes: Record<string, string | number> = {};
      if (updated.price !== before.price) {
        changes.priceFrom = before.price;
        changes.priceTo = updated.price;
      }
      if (updated.compareAtPrice !== before.compareAtPrice) {
        changes.compareAtFrom = before.compareAtPrice ?? "aucun";
        changes.compareAtTo = updated.compareAtPrice ?? "aucun";
      }
      if (updated.stock !== before.stock) {
        changes.stockFrom = before.stock;
        changes.stockTo = updated.stock;
      }
      if (updated.isActive !== before.isActive) changes.active = updated.isActive ? "oui" : "non";
      if (Object.keys(changes).length > 0) {
        await this.audit.record({
          action: "product.variant_updated",
          actor: { type: "account", id: accountId },
          target: { type: "product", id: after.id },
          details: { sku: before.sku, ...changes },
          context,
        });
      }
      return after;
    });
  }

  archive(
    accountId: string,
    productId: string,
    context: AuditContext,
  ): Promise<VendorProductRecord> {
    return this.inShop(accountId, async (shop) => {
      const { before, after } = await this.catalog.archive(shop.id, productId, this.clock());
      await this.audit.record({
        action: "product.archived",
        actor: { type: "account", id: accountId },
        target: { type: "product", id: after.id },
        details: { title: shortText(after.title), from: before.status.toLowerCase() },
        context,
      });
      return after;
    });
  }

  restore(
    accountId: string,
    productId: string,
    context: AuditContext,
  ): Promise<VendorProductRecord> {
    return this.inShop(accountId, async (shop) => {
      const before = await this.catalog.get(shop.id, productId);
      const product = await this.catalog.restore(shop.id, productId, this.clock());
      if (product.status === "PUBLISHED") {
        // Offre sur une fiche publiée : de nouveau en ligne sans modération (S7.5-T02)
        await this.audit.record({
          action: "offer.restored",
          actor: { type: "account", id: accountId },
          target: { type: "product", id: product.id },
          details: { title: shortText(product.title) },
          context,
        });
      } else {
        await this.submitted(accountId, product, "remise_en_vente", context, before.status);
      }
      return product;
    });
  }

  // --- Fiches communes et offres (S7.5-T02, ADR-0049) ---

  /** Fiches en ligne qui correspondent à la recherche : vendre un produit existant plutôt que créer un doublon. */
  searchListings(
    accountId: string,
    q: string,
    limit: number,
  ): Promise<{ listing: ListingRecord; myOfferId: string | null }[]> {
    return this.inShop(accountId, (shop) => this.catalog.searchListings(shop.id, q, limit));
  }

  /** Offre de la boutique sur une fiche en ligne : en ligne tout de suite (prix et stock seulement), tracée. */
  createOffer(
    accountId: string,
    listingId: string,
    lines: readonly OfferLineInput[],
    context: AuditContext,
  ): Promise<VendorProductRecord> {
    return this.inShop(accountId, async (shop) => {
      const offer = await this.catalog.createOffer(shop.id, listingId, lines, this.clock());
      await this.audit.record({
        action: "offer.created",
        actor: { type: "account", id: accountId },
        target: { type: "product", id: offer.id },
        details: {
          title: shortText(offer.title),
          listing: offer.listingId,
          lines: offer.variants.length,
          priceFrom: Math.min(...offer.variants.map((v) => v.price)),
        },
        context,
      });
      return offer;
    });
  }

  /** Nouvelle déclinaison de la fiche proposée par l'offre : sans modération, tracée (prix, stock). */
  addOfferVariant(
    accountId: string,
    productId: string,
    line: OfferLineInput,
    context: AuditContext,
  ): Promise<VendorProductRecord> {
    return this.inShop(accountId, async (shop) => {
      const after = await this.catalog.addOfferVariant(shop.id, productId, line, this.clock());
      const added = after.variants.at(-1)!;
      await this.audit.record({
        action: "offer.variant_added",
        actor: { type: "account", id: accountId },
        target: { type: "product", id: after.id },
        details: {
          sku: added.sku,
          listingVariant: added.listingVariantId,
          price: added.price,
          stock: added.stock,
        },
        context,
      });
      return after;
    });
  }

  // --- Photos (S6-T04, ADR-0035) ---

  /**
   * Ajoute une photo : le produit repasse en modération (BR-003). Le fichier est réencodé ENTRE deux transactions
   * courtes (aucun verrou pendant le calcul) : d'abord une vérification rapide (boutique active, produit à elle, pas
   * archivé, moins de 10 photos : pas de réencodage pour rien), puis tout est revérifié sous verrou au moment d'écrire.
   */
  async addImage(
    accountId: string,
    productId: string,
    bytes: Uint8Array,
    context: AuditContext,
  ): Promise<VendorProductRecord> {
    await this.inShop(accountId, (shop) =>
      this.catalog.checkImageRoom(shop.id, productId, this.clock()),
    );
    const image = await this.catalog.prepareImage(bytes);
    return this.inShop(accountId, async (current) => {
      const { before, after, imageId } = await this.catalog.addImage(
        current.id,
        productId,
        image,
        this.clock(),
      );
      // Identifiant et empreinte de la photo au journal : on sait toujours quelle image a été envoyée
      await this.submitted(accountId, after, "photo", context, before.status, {
        image: imageId,
        sha256: image.sha256,
      });
      return after;
    });
  }

  /** Retire une photo (tout de suite, sans modération) : elle est effacée et n'est plus jamais servie. */
  removeImage(
    accountId: string,
    productId: string,
    imageId: string,
    context: AuditContext,
  ): Promise<VendorProductRecord> {
    return this.inShop(accountId, async (shop) => {
      const { after, sha256 } = await this.catalog.removeImage(
        shop.id,
        productId,
        imageId,
        this.clock(),
      );
      await this.audit.record({
        action: "product.image_removed",
        actor: { type: "account", id: accountId },
        target: { type: "product", id: after.id },
        details: {
          title: shortText(after.title),
          image: imageId.toLowerCase(),
          ...(sha256 ? { sha256 } : {}),
        },
        context,
      });
      return after;
    });
  }

  /** Nouvel ordre des photos (sans modération : elles ont toutes été validées ou attendent de l'être). Tracé. */
  reorderImages(
    accountId: string,
    productId: string,
    imageIds: readonly string[],
    context: AuditContext,
  ): Promise<VendorProductRecord> {
    return this.inShop(accountId, async (shop) => {
      const after = await this.catalog.reorderImages(shop.id, productId, imageIds, this.clock());
      await this.audit.record({
        action: "product.images_reordered",
        actor: { type: "account", id: accountId },
        target: { type: "product", id: after.id },
        details: { title: shortText(after.title) },
        context,
      });
      return after;
    });
  }

  /** Une photo d'un produit de la boutique, quel que soit son statut (aperçu du vendeur). */
  image(
    accountId: string,
    productId: string,
    imageId: string,
    size: ImageSize,
  ): Promise<StoredImage> {
    return this.inShop(accountId, (shop) =>
      this.catalog.ownImage(shop.id, productId, imageId, size),
    );
  }

  /** Exécute `work` dans une transaction, pour la boutique ACTIVE du compte (verrou partagé). */
  private inShop<T>(accountId: string, work: (shop: Shop) => Promise<T>): Promise<T> {
    return this.tx.run(async () => {
      const shop = await this.shops.shareLockByOwner(accountId);
      if (!shop || shop.status !== "active") throw inactive();
      return work(shop);
    });
  }

  private submitted(
    accountId: string,
    product: VendorProductRecord,
    reason: "creation" | "modification" | "remise_en_vente" | "photo",
    context: AuditContext,
    from?: VendorProductStatus,
    extra: Record<string, string> = {},
  ): Promise<void> {
    return this.audit.record({
      action: "product.submitted",
      actor: { type: "account", id: accountId },
      target: { type: "product", id: product.id },
      details: {
        title: shortText(product.title),
        reason,
        ...(from ? { from: from.toLowerCase() } : {}),
        ...extra,
      },
      context,
    });
  }
}
