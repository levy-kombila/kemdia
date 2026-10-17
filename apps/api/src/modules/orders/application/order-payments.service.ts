import { Inject, Injectable } from "@nestjs/common";
import { adminCanCancel } from "../domain/order.js";
import { OrdersError } from "../domain/orders-error.js";
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
 * Ce que le module payments (S5-T04, ADR-0026) peut faire d'une commande, par le port public du module orders.
 *
 * Tout se passe dans `transaction(...)` : la transaction des commandes (verrous bornés à 3 s, `PANIER_OCCUPE` au-delà),
 * que les écritures du module payments rejoignent. Ordre des verrous : commande → variantes → coupon → paiement.
 * Le statut d'une commande ne change que par ici (paiement reçu, annulation par un administrateur).
 */
@Injectable()
export class OrderPayments {
  constructor(
    @Inject(ORDER_REPOSITORY) private readonly orders: OrderRepository,
    @Inject(ORDERS_TRANSACTION) private readonly tx: OrdersTransaction,
    @Inject(ORDER_STOCK) private readonly stock: OrderStock,
    @Inject(COUPON_REPOSITORY) private readonly coupons: CouponRepository,
  ) {}

  transaction<T>(work: () => Promise<T>): Promise<T> {
    return this.tx.run(work);
  }

  /** Commande du compte, verrouillée (à appeler dans `transaction`). */
  async lockForAccount(accountId: string, reference: string): Promise<OrderRecord> {
    const order = await this.orders.findByReference(accountId, reference, true);
    if (!order) throw notFound();
    return order;
  }

  /** Commande de n'importe quel compte, verrouillée (administration ; à appeler dans `transaction`). */
  async lockForAdmin(reference: string): Promise<OrderRecord> {
    const order = await this.orders.findByReference(null, reference, true);
    if (!order) throw notFound();
    return order;
  }

  /** Commande du compte, sans verrou. */
  async findForAccount(accountId: string, reference: string): Promise<OrderRecord> {
    const order = await this.orders.findByReference(accountId, reference);
    if (!order) throw notFound();
    return order;
  }

  /** Commande verrouillée par son identifiant (résultat d'un paiement) ; on attend le verrou. */
  lockById(orderId: string): Promise<OrderRecord | null> {
    return this.orders.lockById(orderId, true);
  }

  /**
   * Paiement reçu pour une commande verrouillée : en attente de paiement → confirmée (échéance effacée), si le montant
   * est exactement le total. `false` si la commande n'attendait plus ce paiement (annulée, déjà payée…) : l'argent est
   * alors à rembourser.
   */
  async confirmPaid(order: OrderRecord, amount: number, now: Date): Promise<boolean> {
    if (order.status !== "pending_payment" || order.paymentMethod === "cod") return false;
    if (amount !== order.total || order.paidAt !== null) return false;
    await this.orders.setStatus(order.id, "confirmed", now);
    await this.orders.markPaid(order.id, now);
    // Commande payée : les vendeurs la voient, leur délai de 24 h commence (S6-T07, BR-013)
    await this.orders.openShopParts(order.id, now);
    return true;
  }

  /**
   * Espèces encaissées pour une commande à la livraison verrouillée : notée payée (le client ne peut plus l'annuler en
   * ligne — relecture de sécurité du S5-T04). Sans effet si elle l'était déjà.
   */
  async recordCashCollected(order: OrderRecord, now: Date): Promise<void> {
    if (order.paymentMethod !== "cod" || order.status === "cancelled") {
      throw new OrdersError("ANNULATION_IMPOSSIBLE", "cette commande ne peut pas être encaissée");
    }
    if (order.paidAt === null) await this.orders.markPaid(order.id, now);
  }

  /**
   * Annulation par un administrateur (service client) d'une commande verrouillée pas encore expédiée : stock remis en
   * vente, coupon rendu. Une commande déjà annulée est renvoyée telle quelle (`cancelled: false`).
   */
  async cancelByAdmin(
    order: OrderRecord,
    now: Date,
  ): Promise<{ order: OrderRecord; cancelled: boolean }> {
    if (order.status === "cancelled") return { order, cancelled: false };
    if (!adminCanCancel(order.status)) {
      throw new OrdersError(
        "ANNULATION_IMPOSSIBLE",
        "cette commande est déjà partie : elle ne peut plus être annulée",
      );
    }
    await this.stock.release(order.lines);
    await this.coupons.releaseForOrder(order.id, now);
    await this.orders.setStatus(order.id, "cancelled", now, "admin");
    return { order: (await this.orders.findByReference(null, order.reference))!, cancelled: true };
  }
}

function notFound(): OrdersError {
  return new OrdersError("COMMANDE_INTROUVABLE", "commande introuvable");
}
