import type { ProductDetail, Variant } from "@/lib/types";
import type { CartLine } from "./cart";
import type { Favorite } from "./favorites";

/**
 * Règles d'affichage de la fiche produit (FR-013) — logique pure, testée.
 * La variante choisie est dans l'adresse (`?variante=<référence>`) : la page est rendue par le serveur,
 * fonctionne sans JavaScript, et le lien partagé sur WhatsApp ouvre la bonne couleur ou la bonne taille.
 */

/** Variante affichée : celle demandée si elle existe, sinon la variante par défaut (la moins chère). */
export function selectVariant(product: ProductDetail, requestedSku: string | undefined): Variant {
  const requested = requestedSku ? product.variants.find((v) => v.sku === requestedSku) : undefined;
  return (
    requested ??
    product.variants.find((v) => v.id === product.variantId) ??
    (product.variants[0] as Variant)
  );
}

const ATTRIBUTE_LABELS: Record<string, string> = {
  couleur: "Couleur",
  taille: "Taille",
  pointure: "Pointure",
  capacite: "Capacité",
  stockage: "Stockage",
  memoire: "Mémoire",
};

/** Caractéristiques de la variante, avec un libellé lisible (« couleur » → « Couleur »). */
export function attributeRows(variant: Variant): [string, string][] {
  return Object.entries(variant.attributes).map(([key, value]) => [
    ATTRIBUTE_LABELS[key] ?? key.charAt(0).toUpperCase() + key.slice(1).replace(/-/g, " "),
    value,
  ]);
}

/** Ligne de panier pour la variante choisie. Son nom n'est affiché que s'il y avait un choix à faire. */
export function detailCartLine(
  product: ProductDetail,
  variant: Variant,
): Omit<CartLine, "quantity"> {
  return {
    variantId: variant.id,
    productId: product.id,
    slug: product.slug,
    title: product.title,
    variantName: product.variants.length > 1 ? variant.name : "",
    price: variant.price,
    image: product.images[0] ?? null,
    maxQuantity: variant.available ? variant.stock : 0,
  };
}

/** Favori : par produit ; la variante n'est retenue que s'il n'y a pas de choix à faire. */
export function detailFavorite(product: ProductDetail): Omit<Favorite, "addedAt"> {
  return {
    productId: product.id,
    ...(product.variants.length === 1 ? { variantId: product.variantId } : {}),
    slug: product.slug,
    title: product.title,
    price: product.price,
    oldPrice: product.compareAtPrice,
    image: product.images[0] ?? null,
    inStock: product.inStock,
  };
}
