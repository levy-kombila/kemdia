import { randomUUID } from "node:crypto";
import { Injectable } from "@nestjs/common";
import { TransactionContext } from "../../../database/transaction-context.js";
import type { $Enums, Prisma } from "../../../generated/prisma/client.js";
import type {
  NewOrder,
  OrderCursor,
  OrderRecord,
  OrderRepository,
  OrderSummaryRecord,
} from "../application/ports.js";
import type { CartLine } from "../domain/cart.js";
import type { CancelReason, OrderStatus, PaymentMethod } from "../domain/order.js";

const STATUS_TO_DB: Record<OrderStatus, $Enums.OrderStatus> = {
  pending_payment: "PENDING_PAYMENT",
  confirmed: "CONFIRMED",
  preparing: "PREPARING",
  shipped: "SHIPPED",
  delivered: "DELIVERED",
  cancelled: "CANCELLED",
};
const STATUS_FROM_DB = Object.fromEntries(
  Object.entries(STATUS_TO_DB).map(([k, v]) => [v, k]),
) as Record<$Enums.OrderStatus, OrderStatus>;
const METHOD_TO_DB: Record<PaymentMethod, $Enums.PaymentMethod> = {
  airtel: "AIRTEL",
  moov: "MOOV",
  cod: "COD",
};
const METHOD_FROM_DB = Object.fromEntries(
  Object.entries(METHOD_TO_DB).map(([k, v]) => [v, k]),
) as Record<$Enums.PaymentMethod, PaymentMethod>;
const REASON_TO_DB: Record<CancelReason, $Enums.CancelReason> = {
  client: "CLIENT",
  paiement_expire: "PAYMENT_EXPIRED",
};
const REASON_FROM_DB = Object.fromEntries(
  Object.entries(REASON_TO_DB).map(([k, v]) => [v, k]),
) as Record<$Enums.CancelReason, CancelReason>;

const withDetails = {
  items: { orderBy: { position: "asc" } },
  history: { orderBy: [{ at: "asc" }, { id: "asc" }] },
} satisfies Prisma.OrderInclude;
type OrderRow = Prisma.OrderGetPayload<{ include: typeof withDetails }>;

function toRecord(row: OrderRow): OrderRecord {
  return {
    id: row.id,
    reference: row.reference,
    accountId: row.accountId,
    status: STATUS_FROM_DB[row.status],
    paymentMethod: METHOD_FROM_DB[row.paymentMethod],
    paymentPhone: row.paymentPhone,
    subtotal: row.subtotal,
    deliveryFee: row.deliveryFee,
    total: row.total,
    delivery: {
      fullName: row.deliveryName,
      phone: row.deliveryPhone,
      cityId: row.deliveryCityId,
      cityName: row.deliveryCityName,
      neighborhood: row.deliveryNeighborhood,
      landmark: row.deliveryLandmark,
      daysMin: row.deliveryDaysMin,
      daysMax: row.deliveryDaysMax,
    },
    lines: row.items.map((i) => ({
      variantId: i.variantId,
      productId: i.productId,
      title: i.title,
      variantName: i.variantName,
      image: i.image,
      unitPrice: i.unitPrice,
      quantity: i.quantity,
      lineTotal: i.lineTotal,
    })),
    createdAt: row.createdAt,
    paymentDueAt: row.paymentDueAt,
    cancelledAt: row.cancelledAt,
    cancelReason: row.cancelReason ? REASON_FROM_DB[row.cancelReason] : null,
    history: row.history.map((h) => ({ status: STATUS_FROM_DB[h.status], at: h.at })),
    requestHash: row.requestHash,
  };
}

/** Numéros tirés avant d'abandonner (un milliard de possibilités : une collision est déjà très rare). */
const REFERENCE_ATTEMPTS = 5;

/**
 * Commandes (schéma `orders`, S5-T02). Toutes les écritures rejoignent la transaction en cours (`TransactionContext`) :
 * la commande, la réservation du stock (catalogue) et le panier vidé sont enregistrés ensemble ou pas du tout.
 */
@Injectable()
export class PrismaOrderRepository implements OrderRepository {
  constructor(private readonly tx: TransactionContext) {}

  async lockCart(accountId: string): Promise<{ cartId: string; lines: CartLine[] } | null> {
    const db = this.tx.db;
    const rows = await db.$queryRaw<{ id: string }[]>`
      SELECT "id" FROM "orders"."carts" WHERE "account_id" = ${accountId}::uuid FOR UPDATE`;
    const cartId = rows[0]?.id;
    if (!cartId) return null;
    const lines = await db.cartItem.findMany({
      where: { cartId },
      select: { variantId: true, quantity: true },
      orderBy: [{ addedAt: "asc" }, { variantId: "asc" }],
    });
    return { cartId, lines };
  }

  async findByIdempotencyKey(accountId: string, key: string): Promise<OrderRecord | null> {
    const row = await this.tx.db.order.findUnique({
      where: { accountId_idempotencyKey: { accountId, idempotencyKey: key } },
      include: withDetails,
    });
    return row ? toRecord(row) : null;
  }

  countOpen(accountId: string): Promise<number> {
    return this.tx.db.order.count({
      where: { accountId, status: { in: ["PENDING_PAYMENT", "CONFIRMED", "PREPARING"] } },
    });
  }

  async insert(order: NewOrder, now: Date, nextReference: () => string): Promise<OrderRecord> {
    const db = this.tx.db;
    let reference = nextReference();
    for (let attempt = 1; ; attempt++) {
      const taken = await db.order.findUnique({ where: { reference }, select: { id: true } });
      if (!taken) break;
      if (attempt >= REFERENCE_ATTEMPTS) throw new Error("aucun numéro de commande libre");
      reference = nextReference();
    }
    const id = randomUUID();
    await db.order.create({
      data: {
        id,
        reference,
        accountId: order.accountId,
        idempotencyKey: order.idempotencyKey,
        requestHash: order.requestHash,
        status: STATUS_TO_DB[order.status],
        paymentMethod: METHOD_TO_DB[order.paymentMethod],
        paymentPhone: order.paymentPhone,
        subtotal: order.subtotal,
        deliveryFee: order.deliveryFee,
        total: order.total,
        deliveryName: order.delivery.fullName,
        deliveryPhone: order.delivery.phone,
        deliveryCityId: order.delivery.cityId,
        deliveryCityName: order.delivery.cityName,
        deliveryNeighborhood: order.delivery.neighborhood,
        deliveryLandmark: order.delivery.landmark,
        deliveryDaysMin: order.delivery.daysMin,
        deliveryDaysMax: order.delivery.daysMax,
        paymentDueAt: order.paymentDueAt,
        createdAt: now,
        updatedAt: now,
        items: {
          create: order.lines.map((l, position) => ({
            variantId: l.variantId,
            productId: l.productId,
            title: l.title.slice(0, 120),
            variantName: l.variantName.slice(0, 80),
            image: l.image && l.image.length <= 300 ? l.image : null,
            unitPrice: l.unitPrice,
            quantity: l.quantity,
            lineTotal: l.lineTotal,
            position,
          })),
        },
        history: { create: [{ id: randomUUID(), status: STATUS_TO_DB[order.status], at: now }] },
      },
    });
    const row = await db.order.findUniqueOrThrow({ where: { id }, include: withDetails });
    return toRecord(row);
  }

  async removeCartLines(cartId: string, variantIds: readonly string[]): Promise<void> {
    await this.tx.db.cartItem.deleteMany({ where: { cartId, variantId: { in: [...variantIds] } } });
  }

  async findByReference(
    accountId: string,
    reference: string,
    lock = false,
  ): Promise<OrderRecord | null> {
    const db = this.tx.db;
    if (lock) {
      const rows = await db.$queryRaw<{ id: string }[]>`
        SELECT "id" FROM "orders"."orders"
        WHERE "reference" = ${reference} AND "account_id" = ${accountId}::uuid FOR UPDATE`;
      if (!rows[0]) return null;
    }
    const row = await db.order.findFirst({
      where: { reference, accountId },
      include: withDetails,
    });
    return row ? toRecord(row) : null;
  }

  async list(
    accountId: string,
    limit: number,
    before?: OrderCursor,
  ): Promise<{ items: OrderSummaryRecord[]; next: OrderCursor | null }> {
    const rows = await this.tx.db.order.findMany({
      where: {
        accountId,
        ...(before
          ? {
              OR: [
                { createdAt: { lt: before.createdAt } },
                { createdAt: before.createdAt, id: { lt: before.id } },
              ],
            }
          : {}),
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: limit + 1,
      select: {
        id: true,
        reference: true,
        status: true,
        total: true,
        createdAt: true,
        items: { select: { quantity: true, image: true }, orderBy: { position: "asc" } },
      },
    });
    const page = rows.slice(0, limit);
    const last = page.at(-1);
    return {
      items: page.map((r) => ({
        id: r.id,
        reference: r.reference,
        status: STATUS_FROM_DB[r.status],
        total: r.total,
        itemCount: r.items.reduce((n, i) => n + i.quantity, 0),
        image: r.items[0]?.image ?? null,
        createdAt: r.createdAt,
      })),
      next: rows.length > limit && last ? { createdAt: last.createdAt, id: last.id } : null,
    };
  }

  async setStatus(
    orderId: string,
    status: OrderStatus,
    now: Date,
    reason?: CancelReason,
  ): Promise<void> {
    const db = this.tx.db;
    await db.order.update({
      where: { id: orderId },
      data: {
        status: STATUS_TO_DB[status],
        updatedAt: now,
        ...(status === "cancelled"
          ? { cancelledAt: now, cancelReason: REASON_TO_DB[reason ?? "client"] }
          : {}),
      },
    });
    await db.orderStatusChange.create({
      data: { id: randomUUID(), orderId, status: STATUS_TO_DB[status], at: now },
    });
  }

  async findOverdue(now: Date, limit: number): Promise<string[]> {
    const rows = await this.tx.db.order.findMany({
      where: { status: "PENDING_PAYMENT", paymentDueAt: { lt: now } },
      orderBy: { paymentDueAt: "asc" },
      take: limit,
      select: { id: true },
    });
    return rows.map((r) => r.id);
  }

  async lockById(orderId: string): Promise<OrderRecord | null> {
    const db = this.tx.db;
    // SKIP LOCKED : une commande qu'un client annule au même moment est laissée au passage suivant
    const rows = await db.$queryRaw<{ id: string }[]>`
      SELECT "id" FROM "orders"."orders" WHERE "id" = ${orderId}::uuid FOR UPDATE SKIP LOCKED`;
    if (!rows[0]) return null;
    const row = await db.order.findUnique({ where: { id: orderId }, include: withDetails });
    return row ? toRecord(row) : null;
  }
}
