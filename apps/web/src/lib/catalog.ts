import "server-only";
import seed from "@/data/catalog.seed.json";
import {
  EMPTY_FILTERS,
  matchesFilters,
  PRICE_BUCKETS,
  type PriceBucket,
  type ProductFilters,
} from "./filters";
import { normalize } from "./format";
import type { SortKey } from "./search-params";
import type { Category, CategoryNode, Paginated, Product } from "./types";

/**
 * Couche d'accès au catalogue.
 *
 * Sprint 1 : données de démonstration (seed JSON issu de l'ancienne base, sans aucune donnée personnelle).
 * Sprint 3+ : ces fonctions appelleront l'API backend. Les composants ne changent pas,
 * seul ce module change — c'est le « port » de l'architecture hexagonale côté front.
 *
 * `server-only` garantit que ce module n'est jamais embarqué dans le JavaScript envoyé au navigateur.
 */

const categories = seed.categories as Category[];
const products = seed.products as Product[];

const categoryById = new Map(categories.map((c) => [c.id, c]));
const categoryBySlug = new Map(categories.map((c) => [c.slug, c]));

function buildTree(): CategoryNode[] {
  const nodes = new Map<string, CategoryNode>(
    categories.map((c) => [c.id, { ...c, children: [] }]),
  );
  const roots: CategoryNode[] = [];
  for (const node of nodes.values()) {
    const parent = node.parentId ? nodes.get(node.parentId) : undefined;
    if (parent) parent.children.push(node);
    else roots.push(node);
  }
  return roots;
}

const tree = buildTree();

export function getCategoryTree(): CategoryNode[] {
  return tree;
}

export function getRootCategories(): Category[] {
  return categories.filter((c) => c.parentId === null);
}

export function getCategoryBySlug(slug: string): Category | undefined {
  return categoryBySlug.get(slug);
}

export function getCategoryById(id: string): Category | undefined {
  return categoryById.get(id);
}

export function getChildren(categoryId: string): Category[] {
  return categories.filter((c) => c.parentId === categoryId);
}

/** Fil d'Ariane : de la racine jusqu'à la catégorie. */
export function getCategoryPath(categoryId: string): Category[] {
  const path: Category[] = [];
  let current = categoryById.get(categoryId);
  while (current) {
    path.unshift(current);
    current = current.parentId ? categoryById.get(current.parentId) : undefined;
  }
  return path;
}

/** Ids de la catégorie et de tous ses descendants. */
export function getDescendantIds(categoryId: string): Set<string> {
  const ids = new Set<string>([categoryId]);
  let added = true;
  while (added) {
    added = false;
    for (const c of categories) {
      if (c.parentId && ids.has(c.parentId) && !ids.has(c.id)) {
        ids.add(c.id);
        added = true;
      }
    }
  }
  return ids;
}

export function countProducts(categoryId: string): number {
  const ids = getDescendantIds(categoryId);
  return products.filter((p) => ids.has(p.categoryId)).length;
}

export function getProductBySlug(slug: string): Product | undefined {
  return products.find((p) => p.slug === slug);
}

export function getFeaturedProducts(limit = 8): Product[] {
  return products.filter((p) => p.isFeatured).slice(0, limit);
}

export function getNewProducts(limit = 8): Product[] {
  return products.filter((p) => p.isNew).slice(0, limit);
}

export function getBestsellers(limit = 8): Product[] {
  return products
    .filter((p) => p.isBestseller)
    .sort((a, b) => b.reviewCount - a.reviewCount)
    .slice(0, limit);
}

export function getDeals(limit = 8): Product[] {
  return products
    .filter((p) => p.oldPrice !== null && p.oldPrice > p.price)
    .sort((a, b) => b.oldPrice! - b.price - (a.oldPrice! - a.price))
    .slice(0, limit);
}

export function getRelatedProducts(product: Product, limit = 8): Product[] {
  const root = getCategoryPath(product.categoryId)[0];
  const ids = root ? getDescendantIds(root.id) : new Set([product.categoryId]);
  return products.filter((p) => p.id !== product.id && ids.has(p.categoryId)).slice(0, limit);
}

export type ProductQuery = {
  categoryId?: string;
  q?: string;
  sort?: SortKey;
  page?: number;
  pageSize?: number;
  onlyDeals?: boolean;
  filters?: ProductFilters;
};

const sorters: Record<SortKey, (a: Product, b: Product) => number> = {
  pertinence: (a, b) =>
    Number(b.isFeatured) - Number(a.isFeatured) || b.reviewCount - a.reviewCount,
  nouveautes: (a, b) => Number(b.isNew) - Number(a.isNew) || Number(b.id) - Number(a.id),
  "prix-asc": (a, b) => a.price - b.price,
  "prix-desc": (a, b) => b.price - a.price,
  note: (a, b) => b.rating - a.rating || b.reviewCount - a.reviewCount,
};

export function queryProducts({
  categoryId,
  q,
  sort = "pertinence",
  page = 1,
  pageSize = 12,
  onlyDeals = false,
  filters = EMPTY_FILTERS,
}: ProductQuery): Paginated<Product> {
  let result = baseSet({ categoryId, q, onlyDeals });
  result = result.filter((p) => matchesFilters(p, filters));

  const sorted = [...result].sort(sorters[sort]);
  const total = sorted.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(Math.max(1, page), totalPages);
  const start = (safePage - 1) * pageSize;

  return {
    items: sorted.slice(start, start + pageSize),
    page: safePage,
    pageSize,
    total,
    totalPages,
  };
}

/** Produits d'une catégorie / recherche / promotion, AVANT les filtres (sert aussi au calcul des compteurs). */
function baseSet({
  categoryId,
  q,
  onlyDeals = false,
}: Pick<ProductQuery, "categoryId" | "q" | "onlyDeals">): Product[] {
  let result = products;

  if (categoryId) {
    const ids = getDescendantIds(categoryId);
    result = result.filter((p) => ids.has(p.categoryId));
  }

  if (onlyDeals) {
    result = result.filter((p) => p.oldPrice !== null && p.oldPrice > p.price);
  }

  if (q) {
    const terms = normalize(q).split(/\s+/).filter(Boolean);
    result = result.filter((p) => {
      const category = categoryById.get(p.categoryId)?.name ?? "";
      const haystack = normalize(`${p.title} ${p.brand ?? ""} ${category} ${p.color ?? ""}`);
      return terms.every((t) => haystack.includes(t));
    });
  }

  return result;
}

export type Facets = {
  brands: { name: string; count: number }[];
  prices: { key: PriceBucket; label: string; count: number }[];
  inStock: number;
  deals: number;
  rating4: number;
};

/** Compteurs affichés à côté de chaque filtre (« Beats (3) »), calculés sur la liste avant filtres. */
export function getFacets(query: Pick<ProductQuery, "categoryId" | "q" | "onlyDeals">): Facets {
  const base = baseSet(query);
  const brandCounts = new Map<string, number>();
  for (const p of base) if (p.brand) brandCounts.set(p.brand, (brandCounts.get(p.brand) ?? 0) + 1);
  return {
    brands: [...brandCounts]
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name)),
    prices: (Object.keys(PRICE_BUCKETS) as PriceBucket[]).map((key) => ({
      key,
      label: PRICE_BUCKETS[key].label,
      count: base.filter(
        (p) => p.price >= PRICE_BUCKETS[key].min && p.price <= PRICE_BUCKETS[key].max,
      ).length,
    })),
    inStock: base.filter((p) => p.stock > 0).length,
    deals: base.filter((p) => p.oldPrice !== null && p.oldPrice > p.price).length,
    rating4: base.filter((p) => p.rating >= 4).length,
  };
}

export function getAllProductSlugs(): string[] {
  return products.map((p) => p.slug);
}

export function getAllCategorySlugs(): string[] {
  return categories.map((c) => c.slug);
}

export type CategoryHighlight = { category: Category; image: string; count: number };

/** Sous-catégories qui ont des produits, illustrées par leur produit le plus consulté (ronds de l'accueil). */
export function getCategoryHighlights(limit = 12): CategoryHighlight[] {
  const result: CategoryHighlight[] = [];
  for (const root of getRootCategories()) {
    for (const child of getChildren(root.id)) {
      const { items, total } = queryProducts({ categoryId: child.id, pageSize: 1 });
      const image = items[0]?.images[0];
      if (total > 0 && image) result.push({ category: child, image, count: total });
    }
  }
  return result.sort((a, b) => b.count - a.count).slice(0, limit);
}

/** Pour chaque grande catégorie : ses 4 produits phares (tuiles « 4 vignettes » de l'accueil). */
export function getCategoryTiles(): { category: Category; products: Product[] }[] {
  return getRootCategories()
    .map((category) => ({
      category,
      products: queryProducts({ categoryId: category.id, pageSize: 4 }).items,
    }))
    .filter((t) => t.products.length === 4);
}

/** Sous-catégories directes ayant des produits, illustrées (ronds en haut d'une page catégorie). */
export function getChildHighlights(categoryId: string): CategoryHighlight[] {
  return getChildren(categoryId)
    .map((child) => {
      const { items, total } = queryProducts({ categoryId: child.id, pageSize: 1 });
      return { category: child, image: items[0]?.images[0] ?? "", count: total };
    })
    .filter((h) => h.count > 0 && h.image);
}
