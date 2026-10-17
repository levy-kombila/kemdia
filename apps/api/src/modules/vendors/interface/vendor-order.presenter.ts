import { BadRequestException } from "@nestjs/common";
import type { VendorOrder, VendorOrderPage, VendorOrderSummary } from "@kemdia/contracts";
import {
  vendorViewOf,
  type VendorOrderCursor,
  type VendorOrderRecord,
  type VendorOrderSummaryRecord,
} from "../../orders/index.js";

/** Commande vue par une boutique (contrat `VendorOrderSummary`) : SES articles, la ville, rien d'autre du client. */
export function presentVendorOrderSummary(order: VendorOrderSummaryRecord): VendorOrderSummary {
  return {
    reference: order.reference,
    status: vendorViewOf(order.part, order.orderStatus),
    orderStatus: order.orderStatus,
    itemCount: order.part.itemCount,
    subtotal: order.part.subtotal,
    cityName: order.cityName,
    receivedAt: order.part.openedAt.toISOString(),
    dueAt: order.part.dueAt.toISOString(),
    decidedAt: order.part.decidedAt?.toISOString() ?? null,
  };
}

/** Champ par champ : ni la boutique interne des lignes, ni l'image, ni rien du client. */
export function presentVendorOrder(order: VendorOrderRecord, canDecide: boolean): VendorOrder {
  return {
    ...presentVendorOrderSummary(order),
    lines: order.lines.map((l) => ({
      variantId: l.variantId,
      productId: l.productId,
      title: l.title,
      variantName: l.variantName,
      unitPrice: l.unitPrice,
      quantity: l.quantity,
      lineTotal: l.lineTotal,
    })),
    refusalReason: order.part.refusalReason,
    canDecide,
  };
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** Position opaque : ouverture + commande de la dernière ligne lue, en base64url. */
export function encodeVendorOrderCursor(cursor: VendorOrderCursor): string {
  return Buffer.from(`${cursor.openedAt.toISOString()}|${cursor.orderId}`).toString("base64url");
}

export function decodeVendorOrderCursor(raw: string): VendorOrderCursor {
  const [iso, id, ...rest] = Buffer.from(raw, "base64url").toString("utf8").split("|");
  const openedAt = new Date(iso ?? "");
  if (rest.length > 0 || !id || !UUID.test(id) || Number.isNaN(openedAt.getTime())) {
    throw new BadRequestException("Position de page invalide");
  }
  return { openedAt, orderId: id };
}

export function presentVendorOrderPage(page: {
  items: VendorOrderSummaryRecord[];
  next: VendorOrderCursor | null;
}): VendorOrderPage {
  return {
    items: page.items.map(presentVendorOrderSummary),
    nextCursor: page.next ? encodeVendorOrderCursor(page.next) : null,
  };
}
