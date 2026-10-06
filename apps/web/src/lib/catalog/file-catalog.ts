import "server-only";
import {
  BADGES,
  DEFAULT_PAGE_SIZE,
  MAX_PAGE,
  MAX_PAGE_SIZE,
  PRICE_RANGES,
  SORT_KEYS,
  type Badge,
  type Category,
  type CategoryNode,
  type Facets,
  type ProductDetail,
  type ProductQuery,
  type ProductSummary,
  type SortKey,
} from "@kemdia/contracts";
import { demoCatalog, demoIds, type DemoCatalog } from "@kemdia/contracts/demo";
import type { CatalogPort } from "./port";

/**
 * Adaptateur « fichier » : le catalogue de démonstration, servi avec les MÊMES règles que l'API
 * (sous-catégories comprises, recherche mot par mot sans accents, filtres, tris, compteurs, identifiants).
 * Utilisé seulement si API_URL est absente (démo publique jusqu'au S3-T07). À supprimer au S3-T07.
 */

/** Même normalisation que la recherche de l'API (domaine `searchable`) : minuscules, sans accents ni ponctuation. */
export function searchable(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

type Row = {
  summary: ProductSummary;
  description: string;
  images: string[];
  sku: string;
  color: string | null;
  searchText: string;
  /** Ordre du fichier : sert de date de création (le dernier ajouté est le plus récent). */
  order: number;
};

const ORDER: Record<SortKey, (a: ProductSummary, b: ProductSummary) => number> = {
  pertinence: (a, b) =>
    Number(b.isFeatured) - Number(a.isFeatured) || b.reviewCount - a.reviewCount,
  nouveautes: (a, b) => Number(b.isNew) - Number(a.isNew),
  "prix-asc": (a, b) => a.price - b.price,
  "prix-desc": (a, b) => b.price - a.price,
  note: (a, b) => b.rating - a.rating || b.reviewCount - a.reviewCount,
  ventes: (a, b) => b.reviewCount - a.reviewCount || b.rating - a.rating,
};

const BADGE_FILTERS: Record<Badge, (p: ProductSummary) => boolean> = {
  featured: (p) => p.isFeatured,
  new: (p) => p.isNew,
  bestseller: (p) => p.isBestseller,
};

const clamp = (n: number, min: number, max: number) => Math.min(Math.max(n, min), max);

export function createFileCatalog(data: DemoCatalog = demoCatalog): CatalogPort {
  const slugOf = new Map(data.categories.map((c) => [c.id, c.slug]));
  const categories: Category[] = data.categories.map((c) => ({
    id: demoIds.category(c.slug),
    slug: c.slug,
    name: c.name,
    parentId: c.parentId ? demoIds.category(slugOf.get(c.parentId) ?? "") : null,
    icon: c.icon,
    image: c.image,
  }));
  const byId = new Map(categories.map((c) => [c.id, c]));
  const bySlug = new Map(categories.map((c) => [c.slug, c]));
  const childrenOf = (id: string | null) => categories.filter((c) => c.parentId === id);
  const node = (c: Category): CategoryNode => ({ ...c, children: childrenOf(c.id).map(node) });
  const tree = childrenOf(null).map(node);

  const path = (id: string): Category[] => {
    const result: Category[] = [];
    for (let c = byId.get(id); c; c = c.parentId ? byId.get(c.parentId) : undefined)
      result.unshift(c);
    return result;
  };
  const descendants = (id: string): Set<string> => {
    const ids = new Set([id]);
    const visit = (parent: string) =>
      childrenOf(parent).forEach((c) => {
        ids.add(c.id);
        visit(c.id);
      });
    visit(id);
    return ids;
  };

  const rows: Row[] = data.products.map((p, order) => {
    const categoryId = demoIds.category(slugOf.get(p.categoryId) ?? "");
    const categoryName = byId.get(categoryId)?.name ?? "";
    return {
      summary: {
        id: demoIds.product(p.slug),
        slug: p.slug,
        title: p.title,
        brand: p.brand,
        categoryId,
        image: p.images[0] ?? null,
        price: p.price,
        compareAtPrice: p.oldPrice,
        inStock: p.stock > 0,
        variantId: demoIds.variant(p.slug),
        stock: p.stock,
        variantCount: 1,
        rating: p.rating,
        reviewCount: p.reviewCount,
        isFeatured: p.isFeatured,
        isBestseller: p.isBestseller,
        isNew: p.isNew,
      },
      description: p.description,
      images: p.images,
      sku: demoIds.sku(p.slug),
      color: p.color,
      searchText: searchable([p.title, p.brand ?? "", categoryName, p.color ?? ""].join(" ")),
      order,
    };
  });

  /** Sélection AVANT les filtres de la colonne de gauche (sert aussi aux compteurs). Catégorie inconnue → null. */
  function base(query: ProductQuery): Row[] | null {
    let result = rows;
    if (query.category) {
      const category = bySlug.get(query.category);
      if (!category) return null;
      const ids = descendants(category.id);
      result = result.filter((r) => ids.has(r.summary.categoryId));
    }
    const terms = [
      ...new Set(
        searchable(query.q ?? "")
          .split(" ")
          .filter(Boolean),
      ),
    ].slice(0, 8);
    if (terms.length) result = result.filter((r) => terms.every((t) => r.searchText.includes(t)));
    if (query.scope === "promotions")
      result = result.filter((r) => r.summary.compareAtPrice !== null);
    if (query.badge && BADGES.includes(query.badge)) {
      result = result.filter((r) => BADGE_FILTERS[query.badge as Badge](r.summary));
    }
    return result;
  }

  return {
    categoryTree: () => Promise.resolve(tree),

    category(slug) {
      const category = bySlug.get(slug);
      if (!category) return Promise.resolve(null);
      return Promise.resolve({
        category,
        path: path(category.id),
        children: childrenOf(category.id),
      });
    },

    products(query) {
      const pageSize = clamp(query.pageSize ?? DEFAULT_PAGE_SIZE, 1, MAX_PAGE_SIZE);
      const selected = base(query);
      if (!selected)
        return Promise.resolve({ items: [], page: 1, pageSize, total: 0, totalPages: 1 });
      const brands = new Set(query.brands ?? []);
      const filtered = selected
        .filter(({ summary: p }) => {
          if (query.priceMin !== undefined && p.price < query.priceMin) return false;
          if (query.priceMax !== undefined && p.price > query.priceMax) return false;
          if (brands.size && (!p.brand || !brands.has(p.brand))) return false;
          if (query.inStock && !p.inStock) return false;
          if (query.onlyDeals && p.compareAtPrice === null) return false;
          if (query.minRating !== undefined && p.rating < query.minRating) return false;
          return true;
        })
        .sort((a, b) => {
          const sort = query.sort && SORT_KEYS.includes(query.sort) ? query.sort : "pertinence";
          const primary = ORDER[sort](a.summary, b.summary);
          if (primary) return primary;
          if (sort === "nouveautes") return b.order - a.order;
          return a.summary.id.localeCompare(b.summary.id);
        });
      const total = filtered.length;
      const totalPages = Math.max(1, Math.ceil(total / pageSize));
      const page = Math.min(clamp(query.page ?? 1, 1, MAX_PAGE), totalPages);
      const items = filtered.slice((page - 1) * pageSize, page * pageSize).map((r) => r.summary);
      return Promise.resolve({ items, page, pageSize, total, totalPages });
    },

    facets(query) {
      const selected = base(query) ?? [];
      const brandCounts = new Map<string, number>();
      for (const { summary: p } of selected) {
        if (p.brand) brandCounts.set(p.brand, (brandCounts.get(p.brand) ?? 0) + 1);
      }
      const facets: Facets = {
        brands: [...brandCounts]
          .map(([name, count]) => ({ name, count }))
          .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, "fr")),
        prices: PRICE_RANGES.map((r) => ({
          key: r.key,
          count: selected.filter(({ summary: p }) => p.price >= r.min && p.price <= r.max).length,
        })),
        inStock: selected.filter((r) => r.summary.inStock).length,
        deals: selected.filter((r) => r.summary.compareAtPrice !== null).length,
        rating4: selected.filter((r) => r.summary.rating >= 4).length,
      };
      return Promise.resolve(facets);
    },

    product(slug) {
      const row = rows.find((r) => r.summary.slug === slug);
      if (!row) return Promise.resolve(null);
      const { summary: p } = row;
      const trail = path(p.categoryId);
      const detail: ProductDetail = {
        id: p.id,
        slug: p.slug,
        title: p.title,
        description: row.description,
        brand: p.brand,
        category: trail.at(-1) ?? null,
        path: trail,
        images: row.images,
        price: p.price,
        compareAtPrice: p.compareAtPrice,
        inStock: p.inStock,
        totalStock: p.stock,
        variantId: p.variantId,
        rating: p.rating,
        reviewCount: p.reviewCount,
        isFeatured: p.isFeatured,
        isBestseller: p.isBestseller,
        isNew: p.isNew,
        variants: [
          {
            id: p.variantId,
            sku: row.sku,
            name: row.color ?? "Standard",
            attributes: row.color ? { couleur: row.color } : {},
            price: p.price,
            compareAtPrice: p.compareAtPrice,
            stock: p.stock,
            available: p.stock > 0,
          },
        ],
      };
      return Promise.resolve(detail);
    },
  };
}
