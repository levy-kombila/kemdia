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
  VendorEmailRecord,
  VendorOrderCursor,
  VendorOrderRecord,
  VendorOrderSummaryRecord,
} from "../application/ports.js";
import type { CartLine } from "../domain/cart.js";
import type { CancelReason, OrderStatus, PaymentMethod } from "../domain/order.js";
import {
  VENDOR_RESPONSE_MS,
  type ShopPart,
  type ShopPartStatus,
  type VendorView,
} from "../domain/shop-part.js";

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
  admin: "ADMIN",
  vendeur_refus: "VENDOR_REFUSED",
  vendeur_delai: "VENDOR_TIMEOUT",
  livraison_echec: "DELIVERY_FAILED",
};
const REASON_FROM_DB = Object.fromEntries(
  Object.entries(REASON_TO_DB).map(([k, v]) => [v, k]),
) as Record<$Enums.CancelReason, CancelReason>;

const PART_TO_DB: Record<ShopPartStatus, $Enums.ShopPartStatus> = {
  pending: "PENDING",
  accepted: "ACCEPTED",
  refused: "REFUSED",
  expired: "EXPIRED",
};
const PART_FROM_DB = Object.fromEntries(
  Object.entries(PART_TO_DB).map(([k, v]) => [v, k]),
) as Record<$Enums.ShopPartStatus, ShopPartStatus>;

const withDetails = {
  items: { orderBy: { position: "asc" } },
  history: { orderBy: [{ at: "asc" }, { id: "asc" }] },
  shopParts: { orderBy: { createdAt: "asc" } },
} satisfies Prisma.OrderInclude;

type PartRow = Prisma.OrderShopPartGetPayload<object>;

function toPart(row: PartRow): ShopPart {
  return {
    shopId: row.shopId,
    status: PART_FROM_DB[row.status],
    subtotal: row.subtotal,
    itemCount: row.itemCount,
    openedAt: row.openedAt,
    dueAt: row.dueAt,
    decidedAt: row.decidedAt,
    refusalReason: row.refusalReason,
  };
}

type ItemRow = Prisma.OrderItemGetPayload<object>;

function toLine(i: ItemRow) {
  return {
    variantId: i.variantId,
    productId: i.productId,
    shopId: i.shopId,
    title: i.title,
    variantName: i.variantName,
    image: i.image,
    unitPrice: i.unitPrice,
    quantity: i.quantity,
    lineTotal: i.lineTotal,
  };
}

/**
 * Vue du vendeur (S6-T07) → conditions SQL : la part ET la commande. Une part en attente ou acceptée d'une commande
 * annulée (client, équipe, autre vendeur, paiement) est « annulée » ; une part refusée ou expirée le reste.
 */
function viewFilter(view: VendorView | undefined): Prisma.OrderShopPartWhereInput {
  switch (view) {
    case undefined:
      return {};
    case "pending":
    case "accepted":
      return { status: PART_TO_DB[view], order: { status: { not: "CANCELLED" } } };
    case "refused":
    case "expired":
      return { status: PART_TO_DB[view] };
    case "cancelled":
      return { status: { in: ["PENDING", "ACCEPTED"] }, order: { status: "CANCELLED" } };
  }
}

/** Part ouverte : le vendeur la voit (S6-T07). */
const OPENED = { openedAt: { not: null } } satisfies Prisma.OrderShopPartWhereInput;
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
    discount: row.discount,
    couponCode: row.couponCode,
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
    lines: row.items.map(toLine),
    createdAt: row.createdAt,
    paymentDueAt: row.paymentDueAt,
    cancelledAt: row.cancelledAt,
    cancelReason: row.cancelReason ? REASON_FROM_DB[row.cancelReason] : null,
    paidAt: row.paidAt,
    history: row.history.map((h) => ({ status: STATUS_FROM_DB[h.status], at: h.at })),
    requestHash: row.requestHash,
    shopParts: row.shopParts.map(toPart),
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
        discount: order.discount,
        couponCode: order.couponCode,
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
            shopId: l.shopId,
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
        // Une part par boutique (S6-T07) : Kemdia acceptée d'office ; ouverte si la commande naît confirmée
        shopParts: {
          create: order.shopParts.map((p) => ({
            shopId: p.shopId,
            status: PART_TO_DB[p.status],
            subtotal: p.subtotal,
            itemCount: p.itemCount,
            openedAt: p.openedAt,
            dueAt: p.dueAt,
            decidedAt: p.status === "pending" ? null : now,
            emailNextAt: p.openedAt,
            createdAt: now,
          })),
        },
      },
    });
    const row = await db.order.findUniqueOrThrow({ where: { id }, include: withDetails });
    return toRecord(row);
  }

  async removeCartLines(cartId: string, variantIds: readonly string[]): Promise<void> {
    await this.tx.db.cartItem.deleteMany({ where: { cartId, variantId: { in: [...variantIds] } } });
  }

  async findByReference(
    accountId: string | null,
    reference: string,
    lock = false,
  ): Promise<OrderRecord | null> {
    const db = this.tx.db;
    if (lock) {
      const rows =
        accountId === null
          ? await db.$queryRaw<{ id: string }[]>`
        SELECT "id" FROM "orders"."orders" WHERE "reference" = ${reference} FOR UPDATE`
          : await db.$queryRaw<{ id: string }[]>`
        SELECT "id" FROM "orders"."orders"
        WHERE "reference" = ${reference} AND "account_id" = ${accountId}::uuid FOR UPDATE`;
      if (!rows[0]) return null;
    }
    const row = await db.order.findFirst({
      where: accountId === null ? { reference } : { reference, accountId },
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
        // Paiement reçu (S5-T04) : plus d'échéance
        ...(status === "confirmed" ? { paymentDueAt: null } : {}),
      },
    });
    await db.orderStatusChange.create({
      data: { id: randomUUID(), orderId, status: STATUS_TO_DB[status], at: now },
    });
  }

  async markPaid(orderId: string, now: Date): Promise<void> {
    await this.tx.db.order.update({
      where: { id: orderId },
      data: { paidAt: now, updatedAt: now },
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

  async lockById(orderId: string, wait = false): Promise<OrderRecord | null> {
    const db = this.tx.db;
    // SKIP LOCKED : une commande qu'un client annule au même moment est laissée au passage suivant ;
    // `wait` (résultat d'un paiement, S5-T04) : on attend le verrou (borné par lock_timeout)
    const rows = wait
      ? await db.$queryRaw<{ id: string }[]>`
      SELECT "id" FROM "orders"."orders" WHERE "id" = ${orderId}::uuid FOR UPDATE`
      : await db.$queryRaw<{ id: string }[]>`
      SELECT "id" FROM "orders"."orders" WHERE "id" = ${orderId}::uuid FOR UPDATE SKIP LOCKED`;
    if (!rows[0]) return null;
    const row = await db.order.findUnique({ where: { id: orderId }, include: withDetails });
    return row ? toRecord(row) : null;
  }

  // --- Commandes des vendeurs (S6-T07, ADR-0038) ---

  async openShopParts(orderId: string, now: Date): Promise<number> {
    const due = new Date(now.getTime() + VENDOR_RESPONSE_MS);
    const { count } = await this.tx.db.orderShopPart.updateMany({
      where: { orderId, status: "PENDING", openedAt: null },
      data: { openedAt: now, dueAt: due, emailNextAt: now },
    });
    return count;
  }

  /**
   * Commandes prêtes à remettre au transporteur (S7-T01) : confirmées ou en préparation, sans part de vendeur en
   * attente, les plus anciennes d'abord. Une commande confirmée est déjà payée (Mobile Money) ou à la livraison.
   */
  async listReadyToShip(limit: number): Promise<OrderRecord[]> {
    const rows = await this.tx.db.order.findMany({
      where: {
        status: { in: ["CONFIRMED", "PREPARING"] },
        shopParts: { none: { status: "PENDING" } },
      },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      take: limit,
      include: withDetails,
    });
    return rows.map(toRecord);
  }

  countPendingShopParts(orderId: string): Promise<number> {
    return this.tx.db.orderShopPart.count({ where: { orderId, status: "PENDING" } });
  }

  async decideShopPart(
    orderId: string,
    shopId: string,
    decision:
      | { status: "accepted"; by: string }
      | { status: "refused"; by: string; reason: string }
      | { status: "expired" },
    now: Date,
  ): Promise<boolean> {
    const { count } = await this.tx.db.orderShopPart.updateMany({
      where: { orderId, shopId, status: "PENDING", ...OPENED },
      data: {
        status: PART_TO_DB[decision.status],
        decidedAt: now,
        decidedBy: decision.status === "expired" ? null : decision.by,
        refusalReason: decision.status === "refused" ? decision.reason : null,
        // Plus rien à annoncer au vendeur
        emailNextAt: null,
      },
    });
    return count === 1;
  }

  async findVendorOverdue(now: Date, limit: number): Promise<string[]> {
    const rows = await this.tx.db.orderShopPart.findMany({
      where: { status: "PENDING", dueAt: { lte: now }, order: { status: "CONFIRMED" } },
      orderBy: { dueAt: "asc" },
      take: limit,
      distinct: ["orderId"],
      select: { orderId: true },
    });
    return rows.map((r) => r.orderId);
  }

  async listForShop(
    shopId: string,
    query: { view?: VendorView | undefined; limit: number; before?: VendorOrderCursor | undefined },
  ): Promise<{ items: VendorOrderSummaryRecord[]; next: VendorOrderCursor | null }> {
    const { before } = query;
    const rows = await this.tx.db.orderShopPart.findMany({
      where: {
        shopId,
        ...OPENED,
        ...viewFilter(query.view),
        ...(before
          ? {
              AND: [
                {
                  OR: [
                    { openedAt: { lt: before.openedAt } },
                    { openedAt: before.openedAt, orderId: { lt: before.orderId } },
                  ],
                },
              ],
            }
          : {}),
      },
      orderBy: [{ openedAt: "desc" }, { orderId: "desc" }],
      take: query.limit + 1,
      include: {
        order: { select: { reference: true, status: true, deliveryCityName: true } },
      },
    });
    const page = rows.slice(0, query.limit);
    const last = page.at(-1);
    return {
      items: page.map((r) => this.vendorSummary(r)),
      next:
        rows.length > query.limit && last?.openedAt
          ? { openedAt: last.openedAt, orderId: last.orderId }
          : null,
    };
  }

  async findForShop(
    shopId: string,
    reference: string,
    lock = false,
  ): Promise<VendorOrderRecord | null> {
    const db = this.tx.db;
    if (lock) {
      // Commande verrouillée (ordre des verrous : commande → variantes → coupon → paiement)
      const rows = await db.$queryRaw<{ id: string }[]>`
        SELECT o."id" FROM "orders"."orders" AS o
        WHERE o."reference" = ${reference}
          AND EXISTS (SELECT 1 FROM "orders"."order_shop_parts" AS p
                      WHERE p."order_id" = o."id" AND p."shop_id" = ${shopId}::uuid AND p."opened_at" IS NOT NULL)
        FOR UPDATE OF o`;
      if (!rows[0]) return null;
    }
    const row = await db.orderShopPart.findFirst({
      where: { shopId, ...OPENED, order: { reference } },
      include: {
        order: {
          select: {
            reference: true,
            status: true,
            deliveryCityName: true,
            items: { where: { shopId }, orderBy: { position: "asc" } },
          },
        },
      },
    });
    if (!row) return null;
    return {
      ...this.vendorSummary(row),
      lines: row.order.items.map(toLine),
    };
  }

  private vendorSummary(
    row: PartRow & {
      order: { reference: string; status: $Enums.OrderStatus; deliveryCityName: string };
    },
  ): VendorOrderSummaryRecord {
    const part = toPart(row);
    if (!part.openedAt || !part.dueAt) throw new Error("part de boutique non ouverte");
    return {
      orderId: row.orderId,
      reference: row.order.reference,
      orderStatus: STATUS_FROM_DB[row.order.status],
      cityName: row.order.deliveryCityName,
      part: { ...part, openedAt: part.openedAt, dueAt: part.dueAt },
    };
  }

  async findDueVendorEmails(now: Date, limit: number): Promise<VendorEmailRecord[]> {
    const rows = await this.tx.db.orderShopPart.findMany({
      where: { emailSentAt: null, emailNextAt: { lte: now }, emailAttempts: { lt: 5 }, ...OPENED },
      orderBy: { emailNextAt: "asc" },
      take: limit,
      include: { order: { select: { reference: true, status: true } } },
    });
    return rows.flatMap((r) =>
      r.dueAt
        ? [
            {
              orderId: r.orderId,
              shopId: r.shopId,
              reference: r.order.reference,
              orderStatus: STATUS_FROM_DB[r.order.status],
              partStatus: PART_FROM_DB[r.status],
              subtotal: r.subtotal,
              itemCount: r.itemCount,
              dueAt: r.dueAt,
              emailAttempts: r.emailAttempts,
            },
          ]
        : [],
    );
  }

  async claimVendorEmail(
    orderId: string,
    shopId: string,
    now: Date,
    nextAt: Date,
  ): Promise<boolean> {
    // Conditionnelle : deux instances ne prennent jamais le même envoi
    const { count } = await this.tx.db.orderShopPart.updateMany({
      where: {
        orderId,
        shopId,
        emailSentAt: null,
        emailNextAt: { lte: now },
        emailAttempts: { lt: 5 },
      },
      data: { emailAttempts: { increment: 1 }, emailNextAt: nextAt },
    });
    return count === 1;
  }

  async markVendorEmailSent(orderId: string, shopId: string, now: Date): Promise<void> {
    await this.tx.db.orderShopPart.updateMany({
      where: { orderId, shopId },
      data: { emailSentAt: now, emailNextAt: null },
    });
  }

  async giveUpVendorEmail(orderId: string, shopId: string): Promise<void> {
    await this.tx.db.orderShopPart.updateMany({
      where: { orderId, shopId, emailSentAt: null },
      data: { emailNextAt: null },
    });
  }
}
