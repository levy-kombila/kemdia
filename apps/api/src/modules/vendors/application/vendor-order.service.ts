import { Inject, Injectable } from "@nestjs/common";
import { AuditLog, type AuditContext } from "../../audit/index.js";
import {
  VendorOrders,
  type VendorOrderCursor,
  type VendorOrderRecord,
  type VendorOrderSummaryRecord,
  type VendorView,
} from "../../orders/index.js";
import type { Shop } from "../domain/shop.js";
import { VendorsError } from "../domain/vendors-error.js";
import {
  SHOP_REPOSITORY,
  VENDORS_TRANSACTION,
  type ShopRepository,
  type VendorsTransaction,
} from "./ports.js";
import { shortText } from "./vendor-product.service.js";

/** Les commandes des boutiques, vues par le module orders (remplaçable dans les tests). */
export type VendorOrdersPort = Pick<
  VendorOrders,
  "list" | "get" | "accept" | "refuse" | "canDecide"
>;

const inactive = () =>
  new VendorsError(
    "BOUTIQUE_INACTIVE",
    "votre boutique n'est pas active : vous ne pouvez pas traiter de commandes pour l'instant",
  );

/**
 * Commandes de la boutique du compte connecté (S6-T07, ADR-0038 ; BR-013). Comme pour les produits : boutique ACTIVE
 * appartenant au compte, relue sous verrou partagé dans la transaction (une suspension attend la fin de la décision ;
 * un vendeur suspendu entre-temps ne décide plus rien). Le module orders ne reçoit que l'identifiant de CETTE boutique.
 * Chaque décision est inscrite au journal d'audit, dans la même transaction.
 */
@Injectable()
export class VendorOrderService {
  constructor(
    @Inject(SHOP_REPOSITORY) private readonly shops: ShopRepository,
    @Inject(VENDORS_TRANSACTION) private readonly tx: VendorsTransaction,
    @Inject(AuditLog) private readonly audit: Pick<AuditLog, "record">,
    @Inject(VendorOrders) private readonly orders: VendorOrdersPort,
  ) {}

  list(
    accountId: string,
    query: { view?: VendorView | undefined; limit: number; before?: VendorOrderCursor | undefined },
  ): Promise<{ items: VendorOrderSummaryRecord[]; next: VendorOrderCursor | null }> {
    return this.inShop(accountId, (shop) => this.orders.list(shop.id, query));
  }

  /** Commande de la boutique, et si elle attend encore sa réponse. */
  get(
    accountId: string,
    reference: string,
  ): Promise<{ order: VendorOrderRecord; canDecide: boolean }> {
    return this.inShop(accountId, async (shop) => {
      const order = await this.orders.get(shop.id, reference);
      return { order, canDecide: this.orders.canDecide(order) };
    });
  }

  accept(
    accountId: string,
    reference: string,
    context: AuditContext,
  ): Promise<{ order: VendorOrderRecord; canDecide: boolean }> {
    return this.inShop(accountId, async (shop) => {
      const result = await this.orders.accept(shop.id, accountId, reference);
      if (result.changed) {
        await this.audit.record({
          action: "order.vendor_accepted",
          actor: { type: "account", id: accountId },
          target: { type: "order", id: result.order.orderId },
          details: {
            reference: result.order.reference,
            shop: shortText(shop.name),
            preparing: result.preparing ? "oui" : "non",
          },
          context,
        });
      }
      return { order: result.order, canDecide: false };
    });
  }

  /** Refus : la commande ENTIÈRE est annulée (choix du 2026-10-17). */
  refuse(
    accountId: string,
    reference: string,
    reason: string,
    context: AuditContext,
  ): Promise<{ order: VendorOrderRecord; canDecide: boolean }> {
    return this.inShop(accountId, async (shop) => {
      const result = await this.orders.refuse(shop.id, accountId, reference, reason);
      if (result.changed) {
        await this.audit.record({
          action: "order.vendor_refused",
          actor: { type: "account", id: accountId },
          target: { type: "order", id: result.order.orderId },
          details: {
            reference: result.order.reference,
            shop: shortText(shop.name),
            reason: shortText(result.reason),
          },
          context,
        });
      }
      return { order: result.order, canDecide: false };
    });
  }

  private inShop<T>(accountId: string, work: (shop: Shop) => Promise<T>): Promise<T> {
    return this.tx.run(async () => {
      const shop = await this.shops.shareLockByOwner(accountId);
      if (!shop || shop.status !== "active") throw inactive();
      return work(shop);
    });
  }
}
