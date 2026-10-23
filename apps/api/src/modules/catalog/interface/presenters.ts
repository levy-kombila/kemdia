import type {
  AvailabilityResponse,
  Category as CategoryDto,
  CategoryNode as CategoryNodeDto,
  ProductDetail,
  SearchSuggestions as SearchSuggestionsDto,
} from "@kemdia/contracts";
import type { AvailabilityResult, SearchSuggestions } from "../application/catalog.service.js";
import type { Category, CategoryNode } from "../domain/category.js";
import type { ListingOffers } from "../domain/listing.js";

/** Transforme les objets du domaine en JSON public : seuls les champs prévus sortent (rien d'interne). */

export function presentCategory(c: Category): CategoryDto {
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

/**
 * Fiche commune et ses offres (S7.5-T02). Les champs d'avant (prix, variantes…) sont ceux de l'offre MISE EN AVANT :
 * le site ajoute au panier la variante de cette offre. `offers` liste toutes les offres visibles, la mise en avant
 * d'abord.
 */
export function presentProduct(view: ListingOffers, path: Category[]): ProductDetail {
  const category = path.at(-1) ?? null;
  const { content, main } = view;
  const available = (stock: number) => stock > 0;
  return {
    id: content.id,
    slug: content.slug,
    title: content.title,
    description: content.description,
    brand: content.brand,
    category: category ? presentCategory(category) : null,
    path: path.map(presentCategory),
    images: [...content.images],
    price: main.variant.price,
    compareAtPrice: main.variant.compareAtPrice,
    inStock: view.inStock,
    totalStock: view.totalStock,
    variantId: main.variant.id,
    rating: content.rating,
    reviewCount: content.reviewCount,
    isFeatured: content.isFeatured,
    isBestseller: content.isBestseller,
    isNew: content.isNew,
    // Une variante par déclinaison proposée : celle de l'offre mise en avant pour cette déclinaison
    variants: view.choices.map(({ listingVariant, best }) => ({
      id: best.variant.id,
      sku: best.variant.sku,
      name: listingVariant.name,
      attributes: { ...listingVariant.attributes },
      price: best.variant.price,
      compareAtPrice: best.variant.compareAtPrice,
      stock: best.variant.stock,
      available: available(best.variant.stock),
    })),
    offerCount: view.offers.length,
    offers: view.offers.map(({ offer, seller }) => ({
      offerId: offer.id,
      seller: seller ? { name: seller.name, slug: seller.slug, city: seller.city } : null,
      isMain: offer.id === main.offer.id,
      variants: offer.variants
        .filter((v) => v.isActive)
        .map((v) => ({
          variantId: v.id,
          listingVariantId: v.listingVariantId,
          name: v.name,
          price: v.price,
          compareAtPrice: v.compareAtPrice,
          stock: v.stock,
          available: available(v.stock),
        })),
    })),
  };
}

export function presentAvailability(results: AvailabilityResult[]): AvailabilityResponse {
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

/** Suggestions (S7.5-T06) : de quoi afficher une ligne, rien de plus (ni stock, ni identifiants internes). */
export function presentSuggestions(s: SearchSuggestions): SearchSuggestionsDto {
  return {
    ...(s.correctedQuery ? { correctedQuery: s.correctedQuery } : {}),
    products: s.products.map((p) => ({
      slug: p.slug,
      title: p.title,
      image: p.image,
      price: p.price,
    })),
    categories: s.categories.map((c) => ({ slug: c.slug, name: c.name })),
    brands: s.brands,
  };
}
