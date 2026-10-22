import { Inject, Injectable } from "@nestjs/common";
import { AuditLog, type AuditContext } from "../../audit/index.js";
import {
  VendorCatalog,
  type ImageSize,
  type ModerationDecision,
  type StoredImage,
  type VendorProductCursor,
  type VendorProductRecord,
} from "../../catalog/index.js";
import { IdentityError, hasRole, type Role } from "../../identity/index.js";
import type { Shop } from "../domain/shop.js";
import { VendorsError } from "../domain/vendors-error.js";
import {
  SHOP_REPOSITORY,
  VENDORS_TRANSACTION,
  type ShopRepository,
  type VendorsTransaction,
} from "./ports.js";
import { shortText, type VendorProductStatus } from "./vendor-product.service.js";

/** Le modérateur qui décide, tel que la session l'a authentifié (rôles relus à chaque requête). */
export interface ModerationActor {
  accountId: string;
  roles: readonly Role[];
}

/** Produit à modérer, avec sa boutique (nom affiché au modérateur). */
export interface ModeratedProduct {
  product: VendorProductRecord;
  shop: Pick<Shop, "id" | "name" | "status"> | null;
}

export type ModerationCatalogPort = Pick<
  VendorCatalog,
  "moderationQueue" | "moderationGet" | "lockForModeration" | "moderate" | "moderationImage"
>;

/**
 * Modération des produits des vendeurs (S6-T02, ADR-0033 ; BR-003). Réservée aux modérateurs (et aux administrateurs,
 * qui en ont les droits), vérifié par la route ET ici. Personne ne décide pour un produit de sa propre boutique. Le
 * produit est verrouillé, la décision et sa ligne du journal d'audit sont écrites dans la même transaction.
 */
@Injectable()
export class ProductModerationService {
  /** Horloge (remplaçable dans les tests). */
  clock: () => Date = () => new Date();

  constructor(
    @Inject(SHOP_REPOSITORY) private readonly shops: ShopRepository,
    @Inject(VENDORS_TRANSACTION) private readonly tx: VendorsTransaction,
    @Inject(AuditLog) private readonly audit: Pick<AuditLog, "record">,
    @Inject(VendorCatalog) private readonly catalog: ModerationCatalogPort,
  ) {}

  async queue(query: {
    status: VendorProductStatus;
    limit: number;
    after?: VendorProductCursor | undefined;
  }): Promise<{ items: ModeratedProduct[]; next: VendorProductCursor | null }> {
    const page = await this.catalog.moderationQueue(query);
    const shops = new Map<string, Shop | null>();
    for (const product of page.items) {
      if (!shops.has(product.shopId)) {
        shops.set(product.shopId, await this.shops.findById(product.shopId));
      }
    }
    return {
      items: page.items.map((product) => ({
        product,
        shop: pickShop(shops.get(product.shopId) ?? null),
      })),
      next: page.next,
    };
  }

  /** Une photo d'un produit de vendeur, quel que soit son statut (la modération voit ce qu'elle valide). */
  image(productId: string, imageId: string, size: ImageSize): Promise<StoredImage> {
    return this.catalog.moderationImage(productId, imageId, size);
  }

  async get(productId: string): Promise<ModeratedProduct> {
    const product = await this.catalog.moderationGet(productId);
    return { product, shop: pickShop(await this.shops.findById(product.shopId)) };
  }

  async decide(
    actor: ModerationActor,
    productId: string,
    decision: ModerationDecision,
    reason: string | null,
    seenSubmittedAt: Date,
    context: AuditContext,
  ): Promise<ModeratedProduct> {
    if (!hasRole(actor.roles, "catalog")) {
      throw new IdentityError("ACCES_REFUSE", "action réservée à la modération");
    }
    return this.tx.run(async () => {
      const locked = await this.catalog.lockForModeration(productId);
      const shop = await this.shops.findById(locked.shopId);
      // Comparaison sans casse, comme PostgreSQL pour les UUID
      if (shop?.ownerAccountId?.toLowerCase() === actor.accountId.toLowerCase()) {
        throw new VendorsError(
          "PRODUIT_SUR_SOI_INTERDIT",
          "vous ne pouvez pas modérer un produit de votre propre boutique",
        );
      }
      const now = this.clock();
      const product = await this.catalog.moderate(locked, decision, {
        moderatorId: actor.accountId,
        reason,
        now,
        seenSubmittedAt,
      });
      await this.audit.record({
        action: decision === "approve" ? "product.approved" : "product.rejected",
        actor: { type: "account", id: actor.accountId },
        target: { type: "product", id: product.id },
        details: {
          title: shortText(product.title),
          from: locked.status.toLowerCase(),
          to: product.status.toLowerCase(),
          ...(product.moderationReason ? { reason: shortText(product.moderationReason) } : {}),
        },
        context,
      });
      return { product, shop: pickShop(shop) };
    });
  }
}

function pickShop(shop: Shop | null): ModeratedProduct["shop"] {
  return shop ? { id: shop.id, name: shop.name, status: shop.status } : null;
}
