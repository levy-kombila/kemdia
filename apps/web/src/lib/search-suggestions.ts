import type { SearchSuggestions } from "@kemdia/contracts";

/**
 * Suggestions pendant la frappe (S7.5-T06) : règles partagées par le champ de recherche (navigateur) et ses tests.
 * Dès 2 lettres, après 250 ms sans frappe.
 */
export const SUGGESTION_MIN_LENGTH = 2;
export const SUGGESTION_DELAY_MS = 250;

export type SuggestionKind = "produit" | "rayon" | "marque" | "boutique";

export interface SuggestionOption {
  key: string;
  kind: SuggestionKind;
  label: string;
  href: string;
  image?: string | null;
  price?: number;
  /** Ville d'une boutique (S8-T05), affichée à droite de la ligne. */
  city?: string;
}

/** Faut-il demander des suggestions pour ce texte ? (assez de lettres, pas trop long) */
export function wantsSuggestions(q: string, maxLength: number): boolean {
  const text = q.trim();
  return text.length >= SUGGESTION_MIN_LENGTH && q.length <= maxLength;
}

/**
 * Lignes affichées, dans l'ordre : rayons, marques, boutiques (S8-T05), puis produits. Les adresses sont construites
 * ici (jamais reprises telles quelles de la réponse) : une adresse de rayon, de boutique ou de produit n'accepte que
 * [a-z0-9-].
 */
export function suggestionOptions(data: SearchSuggestions): SuggestionOption[] {
  const slug = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
  return [
    ...data.categories
      .filter((c) => slug.test(c.slug))
      .map((c) => ({
        key: `rayon-${c.slug}`,
        kind: "rayon" as const,
        label: c.name,
        href: `/categorie/${c.slug}`,
      })),
    ...data.brands.map((b) => ({
      key: `marque-${b}`,
      kind: "marque" as const,
      label: b,
      href: `/recherche?${new URLSearchParams({ q: b }).toString()}`,
    })),
    ...(data.shops ?? [])
      .filter((s) => slug.test(s.slug))
      .map((s) => ({
        key: `boutique-${s.slug}`,
        kind: "boutique" as const,
        label: s.name,
        href: `/boutique/${s.slug}`,
        city: s.city,
      })),
    ...data.products
      .filter((p) => slug.test(p.slug))
      .map((p) => ({
        key: `produit-${p.slug}`,
        kind: "produit" as const,
        label: p.title,
        href: `/produit/${p.slug}`,
        image: p.image,
        price: p.price,
      })),
  ];
}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null;
const isString = (v: unknown): v is string => typeof v === "string";

/**
 * Lecture de la réponse dans le navigateur, sans embarquer les schémas Zod du contrat dans TOUTES les pages (le champ
 * est dans l'en-tête) : le serveur du site a déjà vérifié la réponse de l'API avec le schéma ; ici on refuse tout ce
 * qui n'a pas la forme attendue. `null` : pas de suggestions.
 */
export function parseSuggestions(body: unknown): SearchSuggestions | null {
  if (!isRecord(body)) return null;
  const { products, categories, brands, correctedQuery } = body;
  // S8-T05 : absent d'une réponse d'avant 2.8.0 → aucune boutique (jamais un refus de toute la réponse)
  const shops = body.shops === undefined ? [] : body.shops;
  if (!Array.isArray(shops)) return null;
  if (!Array.isArray(products) || !Array.isArray(categories) || !Array.isArray(brands)) return null;
  if (correctedQuery !== undefined && !isString(correctedQuery)) return null;
  const okProducts = products.every(
    (p) =>
      isRecord(p) &&
      isString(p.slug) &&
      isString(p.title) &&
      (p.image === null || isString(p.image)) &&
      typeof p.price === "number",
  );
  const okCategories = categories.every((c) => isRecord(c) && isString(c.slug) && isString(c.name));
  const okShops = shops.every(
    (s) =>
      isRecord(s) &&
      isString(s.slug) &&
      isString(s.name) &&
      isString(s.city) &&
      typeof s.official === "boolean",
  );
  if (!okProducts || !okCategories || !okShops || !brands.every(isString)) return null;
  return {
    ...(correctedQuery !== undefined ? { correctedQuery } : {}),
    products: products.slice(0, 4),
    categories: categories.slice(0, 2),
    brands: brands.slice(0, 2),
    shops: shops.slice(0, 2),
  } as SearchSuggestions;
}
