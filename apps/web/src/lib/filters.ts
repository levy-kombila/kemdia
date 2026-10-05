/**
 * Filtres du catalogue (S2-T03, FR-005) lus depuis l'URL.
 * Même principe que le tri (leçon MED-13) : liste blanche, bornes, jamais d'erreur sur une valeur inconnue.
 * Les URL restent partageables (WhatsApp) et fonctionnent sans JavaScript.
 */

export const PRICE_BUCKETS = {
  "moins-50000": { label: "Moins de 50 000 FCFA", min: 0, max: 49_999 },
  "50000-150000": { label: "50 000 à 150 000 FCFA", min: 50_000, max: 150_000 },
  "150000-300000": { label: "150 000 à 300 000 FCFA", min: 150_001, max: 300_000 },
  "plus-300000": { label: "Plus de 300 000 FCFA", min: 300_001, max: Number.MAX_SAFE_INTEGER },
} as const;

export type PriceBucket = keyof typeof PRICE_BUCKETS;

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

type Filterable = {
  price: number;
  oldPrice: number | null;
  brand: string | null;
  stock: number;
  rating: number;
};

export function matchesFilters(p: Filterable, f: ProductFilters): boolean {
  if (f.price) {
    const { min, max } = PRICE_BUCKETS[f.price];
    if (p.price < min || p.price > max) return false;
  }
  if (f.brands.length && (!p.brand || !f.brands.includes(p.brand))) return false;
  if (f.inStock && p.stock <= 0) return false;
  if (f.onlyDeals && !(p.oldPrice !== null && p.oldPrice > p.price)) return false;
  if (f.minRating && p.rating < f.minRating) return false;
  return true;
}
