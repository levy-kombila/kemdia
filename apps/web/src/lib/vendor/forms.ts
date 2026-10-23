// Lu aussi par le navigateur : seulement les constantes du contrat (pas de Zod)
import { SHOP_LIMITS, VENDOR_PRODUCT_LIMITS } from "@kemdia/contracts/constants";
import { CITIES, OTHER_NEIGHBORHOOD } from "@kemdia/contracts/delivery";
import { normalizeGabonPhone } from "@/lib/auth/validation";
import { isUuid } from "./images";

/**
 * Formulaires de l'espace vendeur (S6-T06) : mêmes règles dans le navigateur (messages immédiats) et dans les actions
 * serveur (points d'entrée publics). L'API refait toutes les vérifications ; ici, on évite seulement un aller-retour.
 */

const L = VENDOR_PRODUCT_LIMITS;
/** Prix au plus (FCFA, entier) : même borne que le contrat. */
export const PRICE_MAX = 100_000_000;
export const STOCK_MAX = 1_000_000;

const str = (value: unknown, max: number): string | null =>
  typeof value === "string" && value.length <= max ? value : null;
/** Retire les caractères de contrôle et les espaces en trop (l'API retire aussi les caractères invisibles). */
const clean = (value: string) =>
  value
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "")
    .replace(/[ \t]+/g, " ")
    .trim();
const between = (value: string, min: number, max: number) =>
  value.length >= min && value.length <= max;

/**
 * « 12 500 » ou « 12.500 » → 12500 ; vide → null ; autre chose qu'un entier positif raisonnable → NaN. Le point n'est
 * accepté que comme séparateur de milliers : « 12.50 » est REFUSÉ (et non lu 1250, relecture de sécurité S6-T06).
 */
export function parseAmount(value: unknown, max = PRICE_MAX): number | null {
  if (typeof value !== "string" || value.length > 20) return Number.NaN;
  // \s couvre aussi les espaces insécables (U+00A0, U+202F) que mettent certains claviers
  let digits = value.replace(/\s/g, "");
  if (digits === "") return null;
  if (digits.includes(".")) {
    if (!/^\d{1,3}(?:\.\d{3})+$/.test(digits)) return Number.NaN;
    digits = digits.replace(/\./g, "");
  }
  if (!/^\d{1,9}$/.test(digits)) return Number.NaN;
  const n = Number(digits);
  return n <= max ? n : Number.NaN;
}

// --- Demande de boutique ---

export type ShopRequestFields = "name" | "city" | "neighborhood" | "phone" | "description";
export type ShopRequestInput = Record<ShopRequestFields, string>;
export type ShopRequestCheck =
  | { ok: true; value: ShopRequestInput }
  | { ok: false; errors: Partial<Record<ShopRequestFields, string>> };

/**
 * Ville et quartier d'une boutique (S7.5-T07) : listes officielles de la livraison. Quartier vide ou « Autre
 * quartier » : non précisé (envoyé vide). Les mêmes règles sont revérifiées par l'API.
 */
export function checkShopPlace(
  rawCity: unknown,
  rawNeighborhood: unknown,
): {
  city: string;
  neighborhood: string;
  errors: Partial<Record<"city" | "neighborhood", string>>;
} {
  const cityName = clean(str(rawCity, 200) ?? "");
  const quarter = clean(str(rawNeighborhood, 200) ?? "");
  const city = CITIES.find((c) => c.name === cityName);
  if (!city)
    return {
      city: cityName,
      neighborhood: "",
      errors: { city: "Choisissez la ville dans la liste." },
    };
  if (!quarter || quarter === OTHER_NEIGHBORHOOD)
    return { city: city.name, neighborhood: "", errors: {} };
  if (!city.neighborhoods.includes(quarter))
    return {
      city: city.name,
      neighborhood: "",
      errors: { neighborhood: `Choisissez un quartier de ${city.name} dans la liste.` },
    };
  return { city: city.name, neighborhood: quarter, errors: {} };
}

export function checkShopRequest(input: unknown): ShopRequestCheck {
  const raw = (input ?? {}) as Record<string, unknown>;
  const S = SHOP_LIMITS;
  const name = clean(str(raw.name, 200) ?? "");
  const place = checkShopPlace(raw.city, raw.neighborhood);
  const description = clean(str(raw.description, 2000) ?? "");
  const phone = normalizeGabonPhone(str(raw.phone, 30) ?? "");
  const errors: Partial<Record<ShopRequestFields, string>> = { ...place.errors };
  if (!between(name, S.nameMin, S.nameMax))
    errors.name = `Nom de la boutique : ${S.nameMin} à ${S.nameMax} caractères.`;
  if (!phone) errors.phone = "Mobile gabonais attendu : 06… (Moov) ou 07… (Airtel).";
  if (!between(description, S.descriptionMin, S.descriptionMax))
    errors.description = `Décrivez ce que vous vendez : ${S.descriptionMin} à ${S.descriptionMax} caractères.`;
  if (Object.keys(errors).length > 0 || !phone) return { ok: false, errors };
  return {
    ok: true,
    value: {
      name,
      city: place.city,
      neighborhood: place.neighborhood,
      phone: phone.value,
      description,
    },
  };
}

// --- « Ma boutique » (S7.5-T07) : ville, quartier, description ---

export type ShopProfileFields = "city" | "neighborhood" | "description";
export type ShopProfileInput = Record<ShopProfileFields, string>;

export function checkShopProfile(
  input: unknown,
):
  | { ok: true; value: ShopProfileInput }
  | { ok: false; errors: Partial<Record<ShopProfileFields, string>> } {
  const raw = (input ?? {}) as Record<string, unknown>;
  const S = SHOP_LIMITS;
  const place = checkShopPlace(raw.city, raw.neighborhood);
  const description = clean(str(raw.description, 2000) ?? "");
  const errors: Partial<Record<ShopProfileFields, string>> = { ...place.errors };
  if (!between(description, S.descriptionMin, S.descriptionMax))
    errors.description = `Décrivez ce que vous vendez : ${S.descriptionMin} à ${S.descriptionMax} caractères.`;
  if (Object.keys(errors).length > 0) return { ok: false, errors };
  return { ok: true, value: { city: place.city, neighborhood: place.neighborhood, description } };
}

// --- Produit ---

export type VariantDraft = {
  name: string;
  price: string;
  compareAtPrice: string;
  stock: string;
};
export type ProductDraft = {
  title: string;
  description: string;
  brand: string;
  categoryId: string;
};
export type ProductContent = {
  title: string;
  description: string;
  brand: string | null;
  categoryId: string;
};
export type VariantValue = {
  name: string;
  price: number;
  compareAtPrice: number | null;
  stock: number;
};
export type ProductErrors = Partial<Record<keyof ProductDraft, string>> & {
  variants?: (Partial<Record<keyof VariantDraft, string>> | undefined)[];
  form?: string;
};

export function checkContent(
  input: unknown,
): { ok: true; value: ProductContent } | { ok: false; errors: ProductErrors } {
  const raw = (input ?? {}) as Record<string, unknown>;
  const title = clean(str(raw.title, 500) ?? "");
  const description = (str(raw.description, L.descriptionMax * 2) ?? "")
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "")
    .trim();
  const brand = clean(str(raw.brand, 200) ?? "");
  const categoryId = str(raw.categoryId, 40) ?? "";
  const errors: ProductErrors = {};
  if (!between(title, L.titleMin, L.titleMax))
    errors.title = `Titre : ${L.titleMin} à ${L.titleMax} caractères.`;
  if (!between(description, L.descriptionMin, L.descriptionMax))
    errors.description = `Description : ${L.descriptionMin} à ${L.descriptionMax} caractères.`;
  if (brand && !between(brand, L.brandMin, L.brandMax))
    errors.brand = `Marque : ${L.brandMin} à ${L.brandMax} caractères (ou laissez vide).`;
  if (!isUuid(categoryId)) errors.categoryId = "Choisissez une catégorie.";
  if (Object.keys(errors).length > 0) return { ok: false, errors };
  return { ok: true, value: { title, description, brand: brand || null, categoryId } };
}

export function checkVariants(
  input: unknown,
): { ok: true; value: VariantValue[] } | { ok: false; errors: ProductErrors } {
  if (!Array.isArray(input) || input.length === 0 || input.length > L.variantsMax)
    return {
      ok: false,
      errors: { form: `Un produit a de 1 à ${L.variantsMax} variantes.` },
    };
  const values: VariantValue[] = [];
  const errors: NonNullable<ProductErrors["variants"]> = [];
  let failed = false;
  for (const [index, item] of input.entries()) {
    const raw = (item ?? {}) as Record<string, unknown>;
    const name = clean(str(raw.name, 200) ?? "");
    const price = parseAmount(raw.price);
    const compareAtPrice = parseAmount(raw.compareAtPrice);
    const stock = parseAmount(raw.stock, STOCK_MAX);
    const e: Partial<Record<keyof VariantDraft, string>> = {};
    // Un produit à variante unique peut garder un nom vide : « Unique »
    if (name.length > L.variantNameMax) e.name = `Nom : ${L.variantNameMax} caractères au plus.`;
    if (price === null || Number.isNaN(price) || price <= 0)
      e.price = "Prix en FCFA, nombre entier.";
    if (Number.isNaN(compareAtPrice)) e.compareAtPrice = "Prix barré en FCFA (ou vide).";
    else if (compareAtPrice !== null && price !== null && compareAtPrice <= price)
      e.compareAtPrice = "Le prix barré doit être plus élevé que le prix.";
    if (stock === null || Number.isNaN(stock)) e.stock = "Stock : nombre entier (0 si épuisé).";
    if (Object.keys(e).length > 0) failed = true;
    errors[index] = Object.keys(e).length > 0 ? e : undefined;
    values.push({
      name: name || (input.length === 1 ? "Unique" : `Variante ${index + 1}`),
      price: price ?? 0,
      compareAtPrice: Number.isNaN(compareAtPrice) ? null : compareAtPrice,
      stock: stock ?? 0,
    });
  }
  if (failed) return { ok: false, errors: { variants: errors } };
  return { ok: true, value: values };
}
