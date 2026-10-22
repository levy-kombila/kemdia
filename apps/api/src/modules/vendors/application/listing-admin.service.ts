import { Inject, Injectable } from "@nestjs/common";
import { AuditLog, type AuditContext } from "../../audit/index.js";
import {
  VendorCatalog,
  type ListingCorrectionRecord,
  type ListingCursor,
  type ListingEditInput,
  type ListingRecord,
  type VendorProductRecord,
} from "../../catalog/index.js";
import { IdentityError, hasRole } from "../../identity/index.js";
import type { Shop } from "../domain/shop.js";
import { VendorsError } from "../domain/vendors-error.js";
import type { ModeratedProduct, ModerationActor } from "./product-moderation.service.js";
import {
  SHOP_REPOSITORY,
  VENDORS_TRANSACTION,
  type ShopRepository,
  type VendorsTransaction,
} from "./ports.js";
import { shortText, type VendorProductStatus } from "./vendor-product.service.js";

export type ListingCatalogPort = Pick<
  VendorCatalog,
  | "listListings"
  | "listingWithOffers"
  | "editListing"
  | "removeListingImage"
  | "mergeListings"
  | "lockOffer"
  | "withdrawOffer"
  | "listCorrections"
  | "lockCorrection"
  | "closeCorrection"
>;

/** Proposition de correction avec le nom de la boutique qui l'a envoyée. */
export interface CorrectionWithShop {
  correction: ListingCorrectionRecord;
  shop: { id: string; name: string } | null;
}

/**
 * Fiches communes, côté équipe (S7.5-T02, ADR-0049) : correction d'une fiche en ligne, retrait d'une photo, fusion des
 * doublons, retrait d'une offre. Réservé aux modérateurs (et administrateurs), vérifié par la route ET ici ; personne
 * n'agit sur une fiche créée par sa propre boutique ni sur sa propre offre. Chaque écriture et sa ligne du journal
 * d'audit sont dans la même transaction.
 */
@Injectable()
export class ListingAdminService {
  /** Horloge (remplaçable dans les tests). */
  clock: () => Date = () => new Date();

  constructor(
    @Inject(SHOP_REPOSITORY) private readonly shops: ShopRepository,
    @Inject(VENDORS_TRANSACTION) private readonly tx: VendorsTransaction,
    @Inject(AuditLog) private readonly audit: Pick<AuditLog, "record">,
    @Inject(VendorCatalog) private readonly catalog: ListingCatalogPort,
  ) {}

  list(query: {
    q?: string | undefined;
    status?: VendorProductStatus | undefined;
    limit: number;
    after?: ListingCursor | undefined;
  }): Promise<{ items: ListingRecord[]; next: ListingCursor | null }> {
    return this.tx.run(() => this.catalog.listListings(query));
  }

  async get(listingId: string): Promise<{ listing: ListingRecord; offers: ModeratedProduct[] }> {
    const { listing, offers } = await this.tx.run(() => this.catalog.listingWithOffers(listingId));
    return { listing, offers: await this.withShops(offers) };
  }

  edit(
    actor: ModerationActor,
    listingId: string,
    input: ListingEditInput,
    context: AuditContext,
  ): Promise<ListingRecord> {
    assertModerator(actor);
    return this.tx.run(async () => {
      await this.assertNotInvolved(actor, [listingId]);
      const { before, after } = await this.catalog.editListing(listingId, input, this.clock());
      const fields: string[] = (["title", "description", "brand", "categoryId"] as const).filter(
        (key) => before[key] !== after[key],
      );
      if (input.variants?.length) fields.push("variants");
      await this.audit.record({
        action: "listing.updated",
        actor: { type: "account", id: actor.accountId },
        target: { type: "listing", id: after.id },
        details: {
          title: shortText(after.title),
          // Ancien titre gardé : une enquête retrouve ce que les clients voyaient avant (relecture S7.5-T02)
          ...(before.title !== after.title ? { from: shortText(before.title) } : {}),
          fields: fields.join(",") || "aucun",
        },
        context,
      });
      return after;
    });
  }

  removeImage(
    actor: ModerationActor,
    listingId: string,
    imageId: string,
    context: AuditContext,
  ): Promise<ListingRecord> {
    assertModerator(actor);
    return this.tx.run(async () => {
      await this.assertNotInvolved(actor, [listingId]);
      const { after, sha256 } = await this.catalog.removeListingImage(
        listingId,
        imageId,
        this.clock(),
      );
      // Empreinte gardée au journal : une photo illicite retirée laisse une trace (comme S6-T04)
      await this.audit.record({
        action: "listing.image_removed",
        actor: { type: "account", id: actor.accountId },
        target: { type: "listing", id: after.id },
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

  merge(
    actor: ModerationActor,
    sourceId: string,
    targetId: string,
    variants: Readonly<Record<string, string>>,
    context: AuditContext,
  ): Promise<{ target: ListingRecord; moved: number }> {
    assertModerator(actor);
    return this.tx.run(async () => {
      await this.assertNotInvolved(actor, [sourceId, targetId]);
      const { source, moved } = await this.catalog.mergeListings(
        sourceId,
        targetId,
        variants,
        this.clock(),
        actor.accountId,
      );
      const { listing: target } = await this.catalog.listingWithOffers(targetId);
      await this.audit.record({
        action: "listing.merged",
        actor: { type: "account", id: actor.accountId },
        target: { type: "listing", id: source.id },
        details: { title: shortText(source.title), into: target.id, offers: moved },
        context,
      });
      return { target, moved };
    });
  }

  withdrawOffer(
    actor: ModerationActor,
    productId: string,
    reason: string,
    context: AuditContext,
  ): Promise<ModeratedProduct> {
    assertModerator(actor);
    return this.tx.run(async () => {
      const locked = await this.catalog.lockOffer(productId);
      const shop = await this.assertNotOwnShop(actor, locked.shopId, "votre propre offre");
      const after = await this.catalog.withdrawOffer(locked, {
        moderatorId: actor.accountId,
        reason,
        now: this.clock(),
      });
      await this.audit.record({
        action: "offer.withdrawn",
        actor: { type: "account", id: actor.accountId },
        target: { type: "product", id: after.id },
        details: {
          title: shortText(after.title),
          from: locked.status.toLowerCase(),
          reason: shortText(reason),
        },
        context,
      });
      return {
        product: after,
        shop: shop ? { id: shop.id, name: shop.name, status: shop.status } : null,
      };
    });
  }

  // --- Propositions de correction (S7.5-T03) ---

  async corrections(query: {
    open: boolean;
    listingId?: string | undefined;
    limit: number;
    after?: ListingCursor | undefined;
  }): Promise<{ items: CorrectionWithShop[]; next: ListingCursor | null }> {
    const page = await this.tx.run(() => this.catalog.listCorrections(query));
    const shops = new Map<string, Shop | null>();
    for (const c of page.items) {
      if (!shops.has(c.shopId)) shops.set(c.shopId, await this.shops.findById(c.shopId));
    }
    return {
      items: page.items.map((correction) => {
        const shop = shops.get(correction.shopId) ?? null;
        return { correction, shop: shop ? { id: shop.id, name: shop.name } : null };
      }),
      next: page.next,
    };
  }

  /** Clôture d'une proposition (après correction de la fiche, ou sans suite), avec une réponse facultative. */
  closeCorrection(
    actor: ModerationActor,
    correctionId: string,
    note: string | null,
    context: AuditContext,
  ): Promise<CorrectionWithShop> {
    assertModerator(actor);
    return this.tx.run(async () => {
      const locked = await this.catalog.lockCorrection(correctionId);
      const shop = await this.assertNotOwnShop(actor, locked.shopId, "votre propre proposition");
      // Relecture S7.5-T03 : pas non plus sur une fiche où sa boutique vend (clore la demande d'un concurrent)
      await this.assertNotInvolved(actor, [locked.listingId]);
      const closed = await this.catalog.closeCorrection(locked, {
        moderatorId: actor.accountId,
        note,
        now: this.clock(),
      });
      await this.audit.record({
        action: "listing.correction_closed",
        actor: { type: "account", id: actor.accountId },
        target: { type: "listing", id: closed.listingId },
        details: {
          correction: closed.id,
          ...(closed.note ? { note: shortText(closed.note) } : {}),
        },
        context,
      });
      return { correction: closed, shop: shop ? { id: shop.id, name: shop.name } : null };
    });
  }

  /**
   * Personne ne touche une fiche que sa boutique a créée ou sur laquelle elle vend (relecture S7.5-T02 : la
   * correction, la photo et la fusion — source ET cible — profiteraient à sa propre boutique).
   */
  private async assertNotInvolved(
    actor: ModerationActor,
    listingIds: readonly string[],
  ): Promise<void> {
    const mine = await this.shops.findByOwner(actor.accountId);
    if (!mine) return;
    for (const id of listingIds) {
      const { listing, offers } = await this.catalog.listingWithOffers(id);
      if (listing.createdByShopId === mine.id || offers.some((o) => o.shopId === mine.id)) {
        throw new VendorsError(
          "PRODUIT_SUR_SOI_INTERDIT",
          "vous ne pouvez pas modifier une fiche sur laquelle votre boutique vend",
        );
      }
    }
  }

  /** Personne ne décide pour sa propre boutique (comme la modération, S6-T02). Renvoie la boutique lue. */
  private async assertNotOwnShop(
    actor: ModerationActor,
    shopId: string,
    what: string,
  ): Promise<Shop | null> {
    const shop = await this.shops.findById(shopId);
    // Comparaison sans casse, comme PostgreSQL pour les UUID
    if (shop?.ownerAccountId?.toLowerCase() === actor.accountId.toLowerCase()) {
      throw new VendorsError("PRODUIT_SUR_SOI_INTERDIT", `vous ne pouvez pas modifier ${what}`);
    }
    return shop;
  }

  private async withShops(offers: VendorProductRecord[]): Promise<ModeratedProduct[]> {
    const shops = new Map<string, Shop | null>();
    for (const offer of offers) {
      if (!shops.has(offer.shopId))
        shops.set(offer.shopId, await this.shops.findById(offer.shopId));
    }
    return offers.map((product) => {
      const shop = shops.get(product.shopId) ?? null;
      return { product, shop: shop ? { id: shop.id, name: shop.name, status: shop.status } : null };
    });
  }
}

function assertModerator(actor: ModerationActor): void {
  if (!hasRole(actor.roles, "catalog")) {
    throw new IdentityError("ACCES_REFUSE", "action réservée à l'équipe catalogue");
  }
}
