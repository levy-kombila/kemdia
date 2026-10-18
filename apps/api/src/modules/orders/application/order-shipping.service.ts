import { Inject, Injectable } from "@nestjs/common";
import { OrdersError } from "../domain/orders-error.js";
import { OrderCancelHooks } from "./order-cancel-hooks.js";
import {
  COUPON_REPOSITORY,
  ORDER_REPOSITORY,
  ORDER_STOCK,
  ORDERS_TRANSACTION,
  type CouponRepository,
  type OrderRecord,
  type OrderRepository,
  type OrderStock,
  type OrdersTransaction,
} from "./ports.js";

/**
 * Ce que le module shipping (S7-T01, ADR-0040) peut faire d'une commande, par le port public du module orders.
 *
 * Tout se passe dans `transaction(...)` : la transaction des commandes (verrous bornés à 3 s), que les écritures du
 * module shipping rejoignent. Le statut d'une commande prête ne change que par ici : remise au transporteur
 * (→ expédiée), livrée, ou annulée après un échec de livraison.
 */
@Injectable()
export class OrderShipping {
  constructor(
    @Inject(ORDER_REPOSITORY) private readonly orders: OrderRepository,
    @Inject(ORDERS_TRANSACTION) private readonly tx: OrdersTransaction,
    @Inject(ORDER_STOCK) private readonly stock: OrderStock,
    @Inject(COUPON_REPOSITORY) private readonly coupons: CouponRepository,
    private readonly cancelHooks: OrderCancelHooks,
  ) {}

  transaction<T>(work: () => Promise<T>): Promise<T> {
    return this.tx.run(work);
  }

  /** Commandes prêtes à remettre au transporteur, les plus anciennes d'abord. */
  listReady(limit: number): Promise<OrderRecord[]> {
    return this.orders.listReadyToShip(limit);
  }

  /** Commande du compte, sans verrou (suivi de la livraison par le client, S7-T02). */
  async findForAccount(accountId: string, reference: string): Promise<OrderRecord> {
    const order = await this.orders.findByReference(accountId, reference);
    if (!order) throw new OrdersError("COMMANDE_INTROUVABLE", "commande introuvable");
    return order;
  }

  /** Commande de n'importe quel compte, verrouillée (à appeler dans `transaction`). */
  async lock(reference: string): Promise<OrderRecord> {
    const order = await this.orders.findByReference(null, reference, true);
    if (!order) throw new OrdersError("COMMANDE_INTROUVABLE", "commande introuvable");
    return order;
  }

  /**
   * Remise au transporteur d'une commande verrouillée : confirmée ou en préparation, tous les vendeurs d'accord
   * (BR-013). Confirmée → en préparation → expédiée (l'historique garde les deux étapes).
   */
  async markShipped(order: OrderRecord, now: Date): Promise<OrderRecord> {
    if (order.status !== "confirmed" && order.status !== "preparing") {
      throw impossible(
        order.status === "pending_payment"
          ? "cette commande attend encore son paiement"
          : "cette commande n'est pas à expédier",
      );
    }
    if ((await this.orders.countPendingShopParts(order.id)) > 0) {
      throw impossible("un vendeur n'a pas encore accepté cette commande");
    }
    if (order.status === "confirmed") await this.orders.setStatus(order.id, "preparing", now);
    await this.orders.setStatus(order.id, "shipped", now);
    return (await this.orders.findByReference(null, order.reference))!;
  }

  /** Commande expédiée et verrouillée → livrée (BR-010 : plus jamais annulable). */
  async markDelivered(order: OrderRecord, now: Date): Promise<OrderRecord> {
    if (order.status !== "shipped")
      throw impossible("cette commande n'est pas en cours de livraison");
    await this.orders.setStatus(order.id, "delivered", now);
    return (await this.orders.findByReference(null, order.reference))!;
  }

  /**
   * Livraison impossible : la commande expédiée et verrouillée est annulée (choix du 2026-10-17). Articles remis en
   * stock (rapportés par le transporteur), coupon rendu, puis le module payments rembourse ce qui a été payé.
   */
  async cancelAfterFailedDelivery(order: OrderRecord, now: Date): Promise<OrderRecord> {
    if (order.status !== "shipped")
      throw impossible("cette commande n'est pas en cours de livraison");
    await this.stock.release(order.lines);
    await this.coupons.releaseForOrder(order.id, now);
    await this.orders.setStatus(order.id, "cancelled", now, "livraison_echec");
    await this.cancelHooks.runDelivery(order, now);
    return (await this.orders.findByReference(null, order.reference))!;
  }
}

function impossible(message: string): OrdersError {
  return new OrdersError("ANNULATION_IMPOSSIBLE", message);
}
