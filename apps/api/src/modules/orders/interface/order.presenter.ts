import { BadRequestException } from "@nestjs/common";
import type { Order, OrderPage } from "@kemdia/contracts";
import type { OrderCursor, OrderRecord, OrderSummaryRecord } from "../application/ports.js";
import { clientCanCancel } from "../domain/order.js";

/** Commande telle que l'API la renvoie (contrat `Order`). */
export function presentOrder(order: OrderRecord): Order {
  return {
    id: order.id,
    reference: order.reference,
    status: order.status,
    paymentMethod: order.paymentMethod,
    paymentPhone: order.paymentPhone,
    subtotal: order.subtotal,
    discount: order.discount,
    couponCode: order.couponCode,
    deliveryFee: order.deliveryFee,
    total: order.total,
    delivery: order.delivery,
    // Champ par champ : la boutique de chaque ligne (S6-T07) reste interne
    lines: order.lines.map((l) => ({
      variantId: l.variantId,
      productId: l.productId,
      title: l.title,
      variantName: l.variantName,
      image: l.image,
      unitPrice: l.unitPrice,
      quantity: l.quantity,
      lineTotal: l.lineTotal,
    })),
    createdAt: order.createdAt.toISOString(),
    paymentDueAt:
      order.status === "pending_payment" ? (order.paymentDueAt?.toISOString() ?? null) : null,
    cancelledAt: order.cancelledAt?.toISOString() ?? null,
    cancelReason: order.cancelReason,
    paidAt: order.paidAt?.toISOString() ?? null,
    canCancel: clientCanCancel(order.status, order.paymentMethod, order.paidAt !== null),
    history: order.history.map((h) => ({ status: h.status, at: h.at.toISOString() })),
  };
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** Position opaque dans « Mes commandes » : date + identifiant de la dernière commande lue, en base64url. */
export function encodeOrderCursor(cursor: OrderCursor): string {
  return Buffer.from(`${cursor.createdAt.toISOString()}|${cursor.id}`).toString("base64url");
}

export function decodeOrderCursor(raw: string): OrderCursor {
  const [iso, id, ...rest] = Buffer.from(raw, "base64url").toString("utf8").split("|");
  const createdAt = new Date(iso ?? "");
  if (rest.length > 0 || !id || !UUID.test(id) || Number.isNaN(createdAt.getTime())) {
    throw new BadRequestException("Position de page invalide");
  }
  return { createdAt, id };
}

export function presentPage(page: {
  items: OrderSummaryRecord[];
  next: OrderCursor | null;
}): OrderPage {
  return {
    items: page.items.map((o) => ({ ...o, createdAt: o.createdAt.toISOString() })),
    nextCursor: page.next ? encodeOrderCursor(page.next) : null,
  };
}
