import { Injectable } from "@nestjs/common";
import { TransactionContext } from "../../../database/transaction-context.js";

/** Commande pas encore terminée (ni livrée, ni annulée) : on ne peut pas encore effacer celui qui l'attend. */
const OPEN_STATUSES = ["PENDING_PAYMENT", "CONFIRMED", "PREPARING", "SHIPPED"] as const;

/**
 * Données personnelles du module orders (S7-T08, ADR-0047). Dans la transaction partagée (`TransactionContext`).
 */
@Injectable()
export class OrdersPersonalData {
  constructor(private readonly tx: TransactionContext) {}

  async blockers(accountId: string): Promise<string[]> {
    const open = await this.tx.db.order.count({
      where: { accountId, status: { in: [...OPEN_STATUSES] } },
    });
    return open > 0 ? ["COMMANDE_EN_COURS"] : [];
  }

  /**
   * Verrouille le panier du compte (FOR UPDATE), comme la création d'une commande (`lockCart`) : une commande en
   * train d'être créée se termine AVANT que l'effacement relise les empêchements, ou attend qu'il soit fini.
   */
  async lock(accountId: string): Promise<void> {
    await this.tx.db.$queryRaw`
      SELECT "id" FROM "orders"."carts" WHERE "account_id" = ${accountId}::uuid FOR UPDATE`;
  }

  /** Références des commandes du compte : le module shipping ne connaît que la commande, pas le compte. */
  async references(accountId: string): Promise<string[]> {
    const rows = await this.tx.db.order.findMany({
      where: { accountId },
      select: { reference: true },
    });
    return rows.map((row) => row.reference);
  }

  async export(accountId: string): Promise<Record<string, unknown>> {
    const db = this.tx.db;
    // L'une après l'autre : dans une transaction, une seule requête à la fois sur la connexion
    const orders = await db.order.findMany({
      where: { accountId },
      orderBy: { createdAt: "desc" },
      select: {
        reference: true,
        status: true,
        createdAt: true,
        paidAt: true,
        cancelledAt: true,
        cancelReason: true,
        paymentMethod: true,
        paymentPhone: true,
        subtotal: true,
        discount: true,
        couponCode: true,
        deliveryFee: true,
        total: true,
        deliveryName: true,
        deliveryPhone: true,
        deliveryCityName: true,
        deliveryNeighborhood: true,
        deliveryLandmark: true,
        items: {
          orderBy: { position: "asc" },
          select: {
            title: true,
            variantName: true,
            unitPrice: true,
            quantity: true,
            lineTotal: true,
          },
        },
        history: { orderBy: { at: "asc" }, select: { status: true, at: true } },
      },
    });
    const cart = await db.cart.findUnique({
      where: { accountId },
      select: { items: { select: { variantId: true, quantity: true, addedAt: true } } },
    });
    return { commandes: orders, panier: cart?.items ?? [] };
  }

  /**
   * Commandes gardées (montants, lignes, dates : comptabilité), mais nom, téléphones et adresse de livraison effacés ;
   * panier supprimé.
   */
  async erase(accountId: string, now: Date): Promise<void> {
    const db = this.tx.db;
    await db.order.updateMany({
      where: { accountId, anonymizedAt: null },
      data: {
        deliveryName: "",
        deliveryPhone: null,
        deliveryNeighborhood: "",
        deliveryLandmark: "",
        paymentPhone: null,
        anonymizedAt: now,
        updatedAt: now,
      },
    });
    await db.cart.deleteMany({ where: { accountId } });
  }
}
