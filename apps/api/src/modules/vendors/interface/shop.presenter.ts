import { BadRequestException } from "@nestjs/common";
import type { AdminShop, Shop as ShopView } from "@kemdia/contracts";
import type { ShopCursor } from "../application/ports.js";
import type { Shop } from "../domain/shop.js";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

function common(shop: Shop) {
  return {
    id: shop.id,
    kind: shop.kind,
    name: shop.name,
    slug: shop.slug,
    city: shop.city,
    description: shop.description,
    status: shop.status,
    statusReason: shop.statusReason,
    phone: shop.contactPhone,
    submittedAt: shop.submittedAt.toISOString(),
    reviewedAt: shop.reviewedAt?.toISOString() ?? null,
  };
}

/** La boutique vue par son propriétaire : jamais qui l'a examinée. */
export function presentShop(shop: Shop): ShopView {
  return common(shop);
}

export function presentAdminShop(shop: Shop): AdminShop {
  return {
    ...common(shop),
    ownerAccountId: shop.ownerAccountId,
    reviewedBy: shop.reviewedBy,
    createdAt: shop.createdAt.toISOString(),
  };
}

export function encodeShopCursor(cursor: ShopCursor): string {
  return Buffer.from(`${cursor.submittedAt.toISOString()}|${cursor.id}`).toString("base64url");
}

export function decodeShopCursor(raw: string): ShopCursor {
  const [iso, id, ...rest] = Buffer.from(raw, "base64url").toString("utf8").split("|");
  const submittedAt = new Date(iso ?? "");
  if (rest.length > 0 || !id || !UUID.test(id) || Number.isNaN(submittedAt.getTime())) {
    throw new BadRequestException("Position de page invalide");
  }
  return { submittedAt, id };
}
