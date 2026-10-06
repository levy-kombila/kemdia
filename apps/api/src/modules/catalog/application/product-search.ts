import {
  BADGES,
  DEFAULT_PAGE_SIZE,
  MAX_BRANDS,
  MAX_PAGE,
  MAX_PAGE_SIZE,
  MAX_QUERY_LENGTH,
  SORT_KEYS,
  type Badge,
  type SortKey,
} from "@kemdia/contracts/constants";
import { searchable } from "../domain/values.js";

/**
 * Validation d'une recherche venant de l'extérieur (URL, API) — même principe que le site (leçon MED-13) :
 * liste blanche, bornes, et jamais d'erreur sur une valeur farfelue : elle est simplement ignorée.
 */

// Bornes publiques : celles du contrat partagé avec le site
export { DEFAULT_PAGE_SIZE, MAX_BRANDS, MAX_PAGE, MAX_PAGE_SIZE, MAX_QUERY_LENGTH };
export const MAX_TERMS = 8;

export interface ProductSearchInput {
  categorySlug?: unknown;
  q?: unknown;
  sort?: unknown;
  page?: unknown;
  pageSize?: unknown;
  priceMin?: unknown;
  priceMax?: unknown;
  brands?: unknown;
  inStock?: unknown;
  onlyDeals?: unknown;
  minRating?: unknown;
  /** « promotions » : liste limitée aux produits en promotion (page Promotions du site), compteurs compris. */
  scope?: unknown;
  /** Sélection éditoriale : « featured », « new » ou « bestseller ». */
  badge?: unknown;
}

export interface ProductSearch {
  categorySlug?: string;
  terms: string[];
  sort: SortKey;
  page: number;
  pageSize: number;
  priceMin?: number;
  priceMax?: number;
  brands: string[];
  inStock: boolean;
  onlyDeals: boolean;
  minRating?: number;
  promotionsOnly: boolean;
  badge?: Badge;
}

const integer = (value: unknown): number | undefined => {
  const n = typeof value === "string" && /^\d{1,9}$/.test(value) ? Number(value) : value;
  return typeof n === "number" && Number.isSafeInteger(n) ? n : undefined;
};
const clamp = (n: number, min: number, max: number) => Math.min(Math.max(n, min), max);
const flag = (value: unknown) => value === true || value === "1" || value === "true";

export function parseProductSearch(input: ProductSearchInput): ProductSearch {
  const q = typeof input.q === "string" ? input.q.slice(0, MAX_QUERY_LENGTH) : "";
  const terms = [...new Set(searchable(q).split(" ").filter(Boolean))].slice(0, MAX_TERMS);

  const brandList = Array.isArray(input.brands)
    ? input.brands
    : typeof input.brands === "string"
      ? input.brands.split(",")
      : [];
  const brands = [
    ...new Set(
      brandList
        .filter((b): b is string => typeof b === "string")
        .map((b) => b.trim())
        .filter((b) => b && b.length <= 60),
    ),
  ].slice(0, MAX_BRANDS);

  const priceMin = integer(input.priceMin);
  const priceMax = integer(input.priceMax);
  const minRating = integer(input.minRating);
  const slug =
    typeof input.categorySlug === "string" && /^[a-z0-9-]{1,120}$/.test(input.categorySlug)
      ? input.categorySlug
      : undefined;

  return {
    ...(slug ? { categorySlug: slug } : {}),
    terms,
    sort: SORT_KEYS.includes(input.sort as SortKey) ? (input.sort as SortKey) : "pertinence",
    page: clamp(integer(input.page) ?? 1, 1, MAX_PAGE),
    pageSize: clamp(integer(input.pageSize) ?? DEFAULT_PAGE_SIZE, 1, MAX_PAGE_SIZE),
    ...(priceMin !== undefined ? { priceMin } : {}),
    ...(priceMax !== undefined && (priceMin === undefined || priceMax >= priceMin)
      ? { priceMax }
      : {}),
    brands,
    inStock: flag(input.inStock),
    onlyDeals: flag(input.onlyDeals),
    ...(minRating !== undefined && minRating >= 1 && minRating <= 5 ? { minRating } : {}),
    promotionsOnly: input.scope === "promotions",
    ...(BADGES.includes(input.badge as Badge) ? { badge: input.badge as Badge } : {}),
  };
}
