/**
 * Favoris (liste de souhaits, FR-014) — logique pure, testée.
 * S2 : conservés dans le navigateur. S4 : synchronisés avec le compte client (module identity / orders).
 * Le stockage du navigateur n'est pas fiable : chaque entrée est revalidée au chargement.
 */

export const MAX_FAVORITES = 100;

export type Favorite = {
  productId: string;
  slug: string;
  title: string;
  /** Prix indicatif au moment de l'ajout ; le vrai prix est celui de la fiche produit */
  price: number;
  oldPrice: number | null;
  image: string | null;
  inStock: boolean;
  addedAt: number;
};

export function isFavorite(list: Favorite[], productId: string): boolean {
  return list.some((f) => f.productId === productId);
}

/** Ajoute en tête de liste, ou retire si déjà présent. */
export function toggleFavorite(list: Favorite[], item: Favorite): Favorite[] {
  if (isFavorite(list, item.productId)) return list.filter((f) => f.productId !== item.productId);
  return [item, ...list].slice(0, MAX_FAVORITES);
}

const isStr = (v: unknown, max = 300): v is string =>
  typeof v === "string" && v.length > 0 && v.length < max;
const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v) && v >= 0;
const SLUG_RE = /^[a-z0-9-]+$/;

export function parseStoredFavorites(raw: string | null): Favorite[] {
  if (!raw) return [];
  try {
    const data: unknown = JSON.parse(raw);
    if (!Array.isArray(data)) return [];
    const out: Favorite[] = [];
    const seen = new Set<string>();
    for (const item of data.slice(0, MAX_FAVORITES)) {
      if (!item || typeof item !== "object") continue;
      const f = item as Record<string, unknown>;
      if (
        !isStr(f.productId, 64) ||
        !isStr(f.slug, 200) ||
        !SLUG_RE.test(f.slug) ||
        !isStr(f.title)
      )
        continue;
      if (!isNum(f.price) || seen.has(f.productId)) continue;
      seen.add(f.productId);
      out.push({
        productId: f.productId,
        slug: f.slug,
        title: f.title,
        price: Math.round(f.price),
        oldPrice: isNum(f.oldPrice) && f.oldPrice > f.price ? Math.round(f.oldPrice) : null,
        image: isStr(f.image) && f.image.startsWith("/images/") ? f.image : null,
        inStock: f.inStock === true,
        addedAt: isNum(f.addedAt) ? f.addedAt : 0,
      });
    }
    return out;
  } catch {
    return [];
  }
}
