import { BadRequestException } from "@nestjs/common";
import type { ModerationProduct, VendorProduct, VendorProductStatus } from "@kemdia/contracts";
import type { VendorProductCursor, VendorProductRecord } from "../../catalog/index.js";
import type { ModeratedProduct } from "../application/product-moderation.service.js";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

const STATUS_TO_API: Record<VendorProductRecord["status"], VendorProductStatus> = {
  DRAFT: "draft",
  PENDING: "pending",
  PUBLISHED: "published",
  REJECTED: "rejected",
  ARCHIVED: "archived",
};
const STATUS_FROM_API: Record<VendorProductStatus, VendorProductRecord["status"]> = {
  draft: "DRAFT",
  pending: "PENDING",
  published: "PUBLISHED",
  rejected: "REJECTED",
  archived: "ARCHIVED",
};

export const statusFromApi = (status: VendorProductStatus) => STATUS_FROM_API[status];

/** Le produit vu par son vendeur : jamais qui l'a examiné. */
export function presentVendorProduct(record: VendorProductRecord): VendorProduct {
  return {
    id: record.id,
    slug: record.slug,
    title: record.title,
    description: record.description,
    brand: record.brand,
    categoryId: record.categoryId,
    images: [...record.images],
    status: STATUS_TO_API[record.status],
    moderationReason: record.moderationReason,
    visible: record.status === "PUBLISHED" && !record.shopSuspended,
    submittedAt: record.submittedAt?.toISOString() ?? null,
    reviewedAt: record.reviewedAt?.toISOString() ?? null,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
    variants: record.variants.map((v) => ({
      id: v.id,
      sku: v.sku,
      name: v.name,
      attributes: { ...v.attributes },
      price: v.price,
      compareAtPrice: v.compareAtPrice,
      stock: v.stock,
      isActive: v.isActive,
    })),
  };
}

export function presentModerationProduct({ product, shop }: ModeratedProduct): ModerationProduct {
  return { ...presentVendorProduct(product), shop, reviewedBy: product.reviewedBy };
}

export function encodeProductCursor(cursor: VendorProductCursor): string {
  return Buffer.from(`${cursor.at.toISOString()}|${cursor.id}`).toString("base64url");
}

export function decodeProductCursor(raw: string): VendorProductCursor {
  const [iso, id, ...rest] = Buffer.from(raw, "base64url").toString("utf8").split("|");
  const at = new Date(iso ?? "");
  if (rest.length > 0 || !id || !UUID.test(id) || Number.isNaN(at.getTime())) {
    throw new BadRequestException("Position de page invalide");
  }
  return { at, id };
}
