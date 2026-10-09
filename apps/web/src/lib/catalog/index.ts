import "server-only";
import {
  PRICE_RANGES,
  type Category,
  type CategoryNode,
  type CategoryView,
  type ProductDetail,
  type ProductPage,
  type ProductQuery,
  type ProductSummary,
} from "@kemdia/contracts";
import { connection } from "next/server";
import { catalogSource } from "@/lib/config/server-config";
import { createApiCatalog } from "./api-catalog";
import type { CatalogPort } from "./port";

/**
 * Accès au catalogue pour les pages (côté serveur uniquement).
 *
 * Règle S3-T05 : le catalogue n'est JAMAIS lu pendant `next build`.
 * - `connection()` rend la page « à la demande » : Next.js ne la pré-génère pas à la construction ;
 * - si une lecture arrivait quand même pendant la construction, la garde ci-dessous fait échouer `next build`
 *   avec un message clair, au lieu de figer dans l'image des données lues au mauvais endroit.
 */
export const BUILD_READ_ERROR =
  "Le catalogue ne doit pas être lu pendant `next build` (page à rendre à la demande). Voir ADR-0011.";

let instance: CatalogPort | undefined;

async function catalog(): Promise<CatalogPort> {
  await connection();
  if (process.env.NEXT_PHASE === "phase-production-build") throw new Error(BUILD_READ_ERROR);
  if (!instance) {
    // Démo : l'API qui se réveille répond 502 quelques secondes ; on patiente (S4-T08)
    instance = createApiCatalog({
      ...catalogSource(),
      retryGatewayErrors: process.env.APP_ENV === "demo",
    });
  }
  return instance;
}

export { CatalogUnavailableError } from "./port";
export type { Category, CategoryNode, CategoryView, ProductDetail, ProductPage, ProductSummary };

export type ListingFacets = {
  brands: { name: string; count: number }[];
  prices: { key: (typeof PRICE_RANGES)[number]["key"]; label: string; count: number }[];
  inStock: number;
  deals: number;
  rating4: number;
};
export type CategoryHighlight = { category: Category; image: string; count: number };
export type CategoryTile = { category: Category; products: ProductSummary[] };

const withoutChildren = (node: CategoryNode): Category => ({
  id: node.id,
  slug: node.slug,
  name: node.name,
  parentId: node.parentId,
  icon: node.icon,
  image: node.image,
});

export async function getCategoryTree(): Promise<CategoryNode[]> {
  return (await catalog()).categoryTree();
}

export async function getRootCategories(): Promise<Category[]> {
  return (await getCategoryTree()).map(withoutChildren);
}

export async function getCategory(slug: string): Promise<CategoryView | null> {
  return (await catalog()).category(slug);
}

export async function getProduct(slug: string): Promise<ProductDetail | null> {
  return (await catalog()).product(slug);
}

export async function listProducts(query: ProductQuery): Promise<ProductPage> {
  return (await catalog()).products(query);
}

/** Compteurs des filtres, avec le libellé de chaque tranche de prix. */
export async function getListingFacets(query: ProductQuery): Promise<ListingFacets> {
  const facets = await (await catalog()).facets(query);
  const counts = new Map(facets.prices.map((p) => [p.key, p.count]));
  return {
    ...facets,
    prices: PRICE_RANGES.map((r) => ({
      key: r.key,
      label: r.label,
      count: counts.get(r.key) ?? 0,
    })),
  };
}

export async function countProducts(categorySlug: string): Promise<number> {
  return (await listProducts({ category: categorySlug, pageSize: 1 })).total;
}

export async function getFeaturedProducts(limit = 8): Promise<ProductSummary[]> {
  return (await listProducts({ badge: "featured", pageSize: limit })).items;
}

export async function getNewProducts(limit = 8): Promise<ProductSummary[]> {
  return (await listProducts({ badge: "new", sort: "nouveautes", pageSize: limit })).items;
}

export async function getBestsellers(limit = 8): Promise<ProductSummary[]> {
  return (await listProducts({ badge: "bestseller", sort: "ventes", pageSize: limit })).items;
}

export async function getDeals(limit = 8): Promise<ProductSummary[]> {
  return (await listProducts({ scope: "promotions", pageSize: limit })).items;
}

/** Produits du même grand rayon que le produit affiché. */
export async function getRelatedProducts(
  product: ProductDetail,
  limit = 8,
): Promise<ProductSummary[]> {
  const root = product.path[0];
  if (!root) return [];
  const { items } = await listProducts({ category: root.slug, pageSize: limit + 1 });
  return items.filter((p) => p.id !== product.id).slice(0, limit);
}

/** Pour chaque catégorie : nombre de produits et photo du premier (une requête par catégorie, en parallèle). */
async function highlights(categories: readonly Category[]): Promise<CategoryHighlight[]> {
  const pages = await Promise.all(
    categories.map((c) => listProducts({ category: c.slug, pageSize: 1 })),
  );
  return categories
    .map((category, i) => ({
      category,
      image: pages[i]?.items[0]?.image ?? "",
      count: pages[i]?.total ?? 0,
    }))
    .filter((h) => h.count > 0 && h.image);
}

/** Sous-catégories des grands rayons qui ont des produits (ronds de l'accueil). */
export async function getCategoryHighlights(limit = 12): Promise<CategoryHighlight[]> {
  const children = (await getCategoryTree()).flatMap((root) => root.children.map(withoutChildren));
  return (await highlights(children)).sort((a, b) => b.count - a.count).slice(0, limit);
}

/** Sous-catégories directes ayant des produits (ronds en haut d'une page catégorie). */
export async function getChildHighlights(categorySlug: string): Promise<CategoryHighlight[]> {
  const view = await getCategory(categorySlug);
  return view ? highlights(view.children) : [];
}

/** Pour chaque grand rayon : ses 4 produits phares (tuiles de l'accueil). */
export async function getCategoryTiles(): Promise<CategoryTile[]> {
  const roots = await getRootCategories();
  const pages = await Promise.all(
    roots.map((c) => listProducts({ category: c.slug, pageSize: 4 })),
  );
  return roots
    .map((category, i) => ({ category, products: pages[i]?.items ?? [] }))
    .filter((t) => t.products.length === 4);
}

/** Toutes les adresses de catégories et de produits (plan du site). */
export async function getSitemapSlugs(): Promise<{ categories: string[]; products: string[] }> {
  const flatten = (nodes: CategoryNode[]): string[] =>
    nodes.flatMap((n) => [n.slug, ...flatten(n.children)]);
  const products: string[] = [];
  for (let page = 1, totalPages = 1; page <= totalPages; page++) {
    const result = await listProducts({ pageSize: 48, page, sort: "nouveautes" });
    totalPages = Math.min(result.totalPages, 50);
    products.push(...result.items.map((p) => p.slug));
  }
  return { categories: flatten(await getCategoryTree()), products };
}
