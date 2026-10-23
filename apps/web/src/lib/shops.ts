import { CITIES, getCity } from "@kemdia/contracts/delivery";

/**
 * Annuaire des boutiques (S7.5-T07, ADR-0054) : lecture des paramètres d'adresse (liste blanche) et ville par défaut.
 * « Près de chez moi » : la ville choisie pour la livraison (cookie `kemdia_ville`) et le quartier choisi sur la page.
 */
export interface ShopFilters {
  city?: string;
  neighborhood?: string;
  page: number;
}

/** `ville` doit être une ville de la liste ; `quartier` un quartier de cette ville ; sinon ignorés. */
export function parseShopFilters(
  params: { ville?: string; quartier?: string; page?: string },
  cookieCityId?: string,
): ShopFilters {
  // `ville=` vide dans l'adresse : toutes les villes (le cookie ne s'impose pas)
  const cityName = params.ville ?? getCity(cookieCityId)?.name;
  const city = CITIES.find((c) => c.name === cityName);
  const neighborhood =
    city && params.quartier && city.neighborhoods.includes(params.quartier)
      ? params.quartier
      : undefined;
  const page = params.page && /^\d{1,3}$/.test(params.page) ? Math.max(1, Number(params.page)) : 1;
  return {
    ...(city ? { city: city.name } : {}),
    ...(neighborhood ? { neighborhood } : {}),
    page,
  };
}

/** Adresse d'une page de l'annuaire (ordre fixe des paramètres). */
export function shopsHref(filters: ShopFilters): string {
  const params = new URLSearchParams();
  params.set("ville", filters.city ?? "");
  if (filters.city && filters.neighborhood) params.set("quartier", filters.neighborhood);
  if (filters.page > 1) params.set("page", String(filters.page));
  return `/boutiques?${params.toString()}`;
}

const monthYear = new Intl.DateTimeFormat("fr-FR", {
  month: "long",
  year: "numeric",
  timeZone: "Africa/Libreville",
});

/** « Vend sur Kemdia depuis octobre 2026 ». */
export function sellingSince(iso: string): string {
  return `Vend sur Kemdia depuis ${monthYear.format(new Date(iso))}`;
}

/** « 12 produits », « 1 produit », « Pas encore de produit ». */
export function productCountLabel(n: number): string {
  if (n === 0) return "Pas encore de produit";
  return `${n} produit${n > 1 ? "s" : ""}`;
}
