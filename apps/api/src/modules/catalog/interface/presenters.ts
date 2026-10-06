import type { Category, CategoryNode } from "../domain/category.js";
import type { Product } from "../domain/product.js";
import type { AvailabilityResult } from "../application/catalog.service.js";
import type { z } from "zod";
import type {
  AvailabilityResponseSchema,
  CategoryNodeDto,
  CategorySchema,
  ProductDetailSchema,
} from "./schemas.js";

/** Transforme les objets du domaine en JSON public : seuls les champs prévus sortent (rien d'interne). */

export function presentCategory(c: Category): z.infer<typeof CategorySchema> {
  return {
    id: c.id,
    slug: c.slug,
    name: c.name,
    parentId: c.parentId,
    icon: c.icon,
    image: c.image,
  };
}

export function presentCategoryNode(node: CategoryNode): CategoryNodeDto {
  return { ...presentCategory(node), children: node.children.map(presentCategoryNode) };
}

export function presentProduct(
  product: Product,
  path: Category[],
): z.infer<typeof ProductDetailSchema> {
  const category = path.at(-1) ?? null;
  return {
    id: product.id,
    slug: product.slug,
    title: product.title,
    description: product.description,
    brand: product.brand,
    category: category ? presentCategory(category) : null,
    path: path.map(presentCategory),
    images: [...product.images],
    price: product.price,
    compareAtPrice: product.compareAtPrice,
    inStock: product.isAvailable,
    totalStock: product.totalStock,
    rating: product.rating,
    reviewCount: product.reviewCount,
    isFeatured: product.isFeatured,
    isBestseller: product.isBestseller,
    isNew: product.isNew,
    // Les variantes désactivées ne sont pas montrées au client
    variants: product.variants
      .filter((v) => v.isActive)
      .map((v) => ({
        id: v.id,
        sku: v.sku,
        name: v.name,
        attributes: { ...v.attributes },
        price: v.price,
        compareAtPrice: v.compareAtPrice,
        stock: v.stock,
        available: product.checkOrderable(v.id, 1).ok,
      })),
  };
}

export function presentAvailability(
  results: AvailabilityResult[],
): z.infer<typeof AvailabilityResponseSchema> {
  return {
    ok: results.every((r) => r.ok),
    lines: results.map((r) =>
      r.ok
        ? { variantId: r.variantId, quantity: r.quantity, ok: true }
        : {
            variantId: r.variantId,
            quantity: r.quantity,
            ok: false,
            reason: r.reason,
            ...(r.available !== undefined ? { available: r.available } : {}),
          },
    ),
  };
}
