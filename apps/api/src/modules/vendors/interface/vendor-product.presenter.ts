import { BadRequestException } from "@nestjs/common";
import type {
  AdminListing,
  ListingCorrection,
  ModerationProduct,
  VendorListing,
  VendorProduct,
  VendorProductStatus,
} from "@kemdia/contracts";
import type {
  ListingCorrectionRecord,
  ListingRecord,
  VendorProductCursor,
  VendorProductRecord,
} from "../../catalog/index.js";
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
export const statusToApi = (status: VendorProductRecord["status"]) => STATUS_TO_API[status];

/** Le produit vu par son vendeur : jamais qui l'a examiné. */
export function presentVendorProduct(record: VendorProductRecord): VendorProduct {
  return {
    id: record.id,
    slug: record.slug,
    listing: {
      id: record.listingId,
      slug: record.listingSlug,
      status: STATUS_TO_API[record.listingStatus],
      editable: record.listingOwnerShopId === record.shopId && record.listingStatus !== "PUBLISHED",
      variants: record.listingVariants.map((v) => ({
        id: v.id,
        name: v.name,
        attributes: { ...v.attributes },
      })),
    },
    title: record.title,
    description: record.description,
    brand: record.brand,
    categoryId: record.categoryId,
    images: [...record.images],
    status: STATUS_TO_API[record.status],
    moderationReason: record.moderationReason,
    visible:
      record.status === "PUBLISHED" &&
      !record.shopSuspended &&
      record.listingStatus === "PUBLISHED",
    submittedAt: record.submittedAt?.toISOString() ?? null,
    reviewedAt: record.reviewedAt?.toISOString() ?? null,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
    variants: record.variants.map((v) => ({
      id: v.id,
      listingVariantId: v.listingVariantId,
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

/** Fiche en ligne trouvée par un vendeur (S7.5-T02) : de quoi choisir la bonne fiche et y poser son offre. */
export function presentVendorListing(
  listing: ListingRecord,
  myOfferId: string | null,
): VendorListing {
  return {
    id: listing.id,
    slug: listing.slug,
    title: listing.title,
    brand: listing.brand,
    categoryId: listing.categoryId,
    image: listing.images[0] ?? null,
    offerCount: listing.offerCount,
    price: listing.price,
    variants: listing.variants.map((v) => ({
      id: v.id,
      name: v.name,
      attributes: { ...v.attributes },
    })),
    myOfferId,
  };
}

/** Fiche vue par l'équipe (S7.5-T02). */
export function presentAdminListing(listing: ListingRecord): AdminListing {
  return {
    id: listing.id,
    slug: listing.slug,
    title: listing.title,
    description: listing.description,
    brand: listing.brand,
    categoryId: listing.categoryId,
    images: [...listing.images],
    status: STATUS_TO_API[listing.status],
    createdByShopId: listing.createdByShopId,
    mergedIntoId: listing.mergedIntoId,
    offerCount: listing.offerCount,
    price: listing.price,
    createdAt: listing.createdAt.toISOString(),
    updatedAt: listing.updatedAt.toISOString(),
    variants: listing.variants.map((v) => ({
      id: v.id,
      name: v.name,
      attributes: { ...v.attributes },
    })),
  };
}

/** Proposition de correction (S7.5-T03) : jamais qui l'a close (le vendeur voit la réponse, pas le modérateur). */
export function presentCorrection(
  correction: ListingCorrectionRecord,
  shop: { id: string; name: string } | null,
): ListingCorrection {
  return {
    id: correction.id,
    listing: {
      id: correction.listingId,
      slug: correction.listingSlug,
      title: correction.listingTitle,
    },
    shop,
    message: correction.message,
    createdAt: correction.createdAt.toISOString(),
    closedAt: correction.closedAt?.toISOString() ?? null,
    note: correction.note,
  };
}
