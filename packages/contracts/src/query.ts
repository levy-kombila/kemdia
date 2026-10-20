import { MAX_PAGE_SIZE, SORT_KEYS, type Badge, type SortKey } from "./constants.js";

/**
 * Paramètres de `GET /api/v1/products` et `GET /api/v1/products/facets`.
 * Côté site, `productQueryParams` construit l'adresse : les noms ne peuvent pas diverger de ceux que l'API lit.
 */
export interface ProductQuery {
  /** Adresse de la catégorie (sous-catégories comprises). */
  category?: string;
  q?: string;
  sort?: SortKey;
  page?: number;
  pageSize?: number;
  priceMin?: number;
  priceMax?: number;
  brands?: readonly string[];
  inStock?: boolean;
  onlyDeals?: boolean;
  minRating?: number;
  /** « promotions » : liste ET compteurs limités aux produits en promotion (page Promotions). */
  scope?: "promotions";
  badge?: Badge;
  /** Ville du client (S7.5-T02) : à prix égal, l'offre d'une boutique de cette ville est mise en avant. */
  ville?: string;
}

/** Paramètres d'URL dans un ordre fixe (même requête → même adresse : utile pour le cache). */
export function productQueryParams(query: ProductQuery): URLSearchParams {
  const params = new URLSearchParams();
  const set = (name: string, value: string | number | undefined) => {
    if (value !== undefined && value !== "") params.set(name, String(value));
  };
  set("category", query.category);
  set("q", query.q?.trim());
  set("sort", query.sort);
  set("page", query.page);
  set("pageSize", query.pageSize);
  set("priceMin", query.priceMin);
  set("priceMax", query.priceMax);
  set("brands", query.brands?.length ? query.brands.join(",") : undefined);
  set("inStock", query.inStock ? "1" : undefined);
  set("onlyDeals", query.onlyDeals ? "1" : undefined);
  set("minRating", query.minRating);
  set("scope", query.scope);
  set("badge", query.badge);
  set("ville", query.ville?.trim());
  return params;
}

/** Description des mêmes paramètres pour la documentation OpenAPI. */
export const PRODUCT_QUERY_PARAMETERS = [
  {
    name: "category",
    description: "Adresse de la catégorie (sous-catégories comprises)",
    schema: { type: "string" },
  },
  {
    name: "q",
    description: "Mots recherchés (sans accents, 100 caractères au plus)",
    schema: { type: "string" },
  },
  {
    name: "sort",
    description: "Tri (« ventes » : les plus demandés d'abord)",
    schema: { type: "string", enum: [...SORT_KEYS], default: "pertinence" },
  },
  {
    name: "page",
    description: "Page (à partir de 1)",
    schema: { type: "integer", minimum: 1, default: 1 },
  },
  {
    name: "pageSize",
    description: "Produits par page",
    schema: { type: "integer", minimum: 1, maximum: MAX_PAGE_SIZE, default: 20 },
  },
  { name: "priceMin", description: "Prix minimum (FCFA)", schema: { type: "integer", minimum: 0 } },
  { name: "priceMax", description: "Prix maximum (FCFA)", schema: { type: "integer", minimum: 0 } },
  {
    name: "brands",
    description: "Marques, séparées par des virgules (10 au plus)",
    schema: { type: "string" },
  },
  { name: "inStock", description: "En stock uniquement", schema: { type: "string", enum: ["1"] } },
  {
    name: "onlyDeals",
    description: "En promotion uniquement",
    schema: { type: "string", enum: ["1"] },
  },
  {
    name: "minRating",
    description: "Note minimale",
    schema: { type: "integer", minimum: 1, maximum: 5 },
  },
  {
    name: "scope",
    description: "« promotions » : page Promotions (liste et compteurs limités aux promotions)",
    schema: { type: "string", enum: ["promotions"] },
  },
  {
    name: "badge",
    description: "Sélection : mis en avant, nouveautés ou meilleures ventes",
    schema: { type: "string", enum: ["featured", "new", "bestseller"] },
  },
  {
    name: "ville",
    description:
      "Ville du client (S7.5-T02) : à prix égal, l'offre d'une boutique de cette ville est mise en avant (ne filtre rien)",
    schema: { type: "string", maxLength: 60 },
  },
] as const;
