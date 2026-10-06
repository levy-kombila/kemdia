/**
 * Filtres du catalogue (S2-T03, FR-005) lus depuis l'URL.
 * Même principe que le tri (leçon MED-13) : liste blanche, bornes, jamais d'erreur sur une valeur inconnue.
 * Les URL restent partageables (WhatsApp) et fonctionnent sans JavaScript.
 */

import { PRICE_RANGES, type PriceRangeKey } from "@kemdia/contracts/constants";
import type { ProductQuery } from "@kemdia/contracts";

/** Tranches de prix : celles du contrat partagé avec l'API (mêmes clés dans l'URL et dans les compteurs). */
export const PRICE_BUCKETS = Object.fromEntries(PRICE_RANGES.map((r) => [r.key, r])) as {
  [K in PriceRangeKey]: Extract<(typeof PRICE_RANGES)[number], { key: K }>;
};

export type PriceBucket = PriceRangeKey;

export type ProductFilters = {
  price?: PriceBucket;
  brands: string[];
  inStock: boolean;
  onlyDeals: boolean;
  minRating?: 4;
};

export const MAX_BRANDS = 10;
export const EMPTY_FILTERS: ProductFilters = { brands: [], inStock: false, onlyDeals: false };

type Params = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

/** `knownBrands` : marques réellement présentes dans le catalogue (toute autre valeur est ignorée). */
export function parseFilters(params: Params, knownBrands: Iterable<string>): ProductFilters {
  const price = one(params.prix);
  const brandSet = new Set(knownBrands);
  const brands = (one(params.marque) ?? "")
    .split(",")
    .map((b) => b.trim())
    .filter((b) => brandSet.has(b));
  return {
    price: price && Object.hasOwn(PRICE_BUCKETS, price) ? (price as PriceBucket) : undefined,
    brands: [...new Set(brands)].slice(0, MAX_BRANDS),
    inStock: one(params.stock) === "1",
    onlyDeals: one(params.promo) === "1",
    minRating: one(params.note) === "4" ? 4 : undefined,
  };
}

/** Paramètres d'URL correspondant aux filtres (inverse de parseFilters). */
export function filtersToParams(f: ProductFilters): Record<string, string> {
  const out: Record<string, string> = {};
  if (f.price) out.prix = f.price;
  if (f.brands.length) out.marque = f.brands.join(",");
  if (f.inStock) out.stock = "1";
  if (f.onlyDeals) out.promo = "1";
  if (f.minRating) out.note = String(f.minRating);
  return out;
}

export function countActiveFilters(f: ProductFilters): number {
  return (
    (f.price ? 1 : 0) +
    f.brands.length +
    (f.inStock ? 1 : 0) +
    (f.onlyDeals ? 1 : 0) +
    (f.minRating ? 1 : 0)
  );
}

/** Filtres de l'URL → paramètres de l'API (`/api/v1/products`). */
export function filtersToQuery(f: ProductFilters): ProductQuery {
  return {
    ...(f.price
      ? { priceMin: PRICE_BUCKETS[f.price].min, priceMax: PRICE_BUCKETS[f.price].max }
      : {}),
    ...(f.brands.length ? { brands: f.brands } : {}),
    ...(f.inStock ? { inStock: true } : {}),
    ...(f.onlyDeals ? { onlyDeals: true } : {}),
    ...(f.minRating ? { minRating: f.minRating } : {}),
  };
}
