import { CatalogError } from "./catalog-error.js";

/**
 * Petites valeurs du catalogue, vérifiées à la création : un objet qui existe est forcément valide.
 */

/** BR-042 : identifiants publics = UUID (jamais des numéros qui se suivent). */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

export function assertUuid(value: string, what: string): string {
  if (!UUID.test(value)) throw new CatalogError("IDENTIFIANT_INVALIDE", `${what} : UUID attendu`);
  return value;
}

/** Adresse lisible : minuscules, chiffres et tirets (ex. « telephones-portables »). */
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
export const SLUG_MAX_LENGTH = 120;

export function assertSlug(value: string): string {
  if (value.length > SLUG_MAX_LENGTH || !SLUG.test(value)) {
    throw new CatalogError(
      "SLUG_INVALIDE",
      `adresse « ${value.slice(0, SLUG_MAX_LENGTH)} » : minuscules, chiffres et tirets uniquement`,
    );
  }
  return value;
}

/**
 * BR-004 : prix en **FCFA entiers** (pas de centimes en FCFA), strictement positifs.
 * Plafond de sécurité : 100 millions FCFA par article (erreur de saisie, débordement).
 */
export const MAX_PRICE_FCFA = 100_000_000;

export function assertPrice(value: number, what = "prix"): number {
  if (!Number.isSafeInteger(value) || value <= 0 || value > MAX_PRICE_FCFA) {
    throw new CatalogError(
      "PRIX_INVALIDE",
      `${what} : entier en FCFA entre 1 et ${MAX_PRICE_FCFA.toLocaleString("fr-FR")}`,
    );
  }
  return value;
}

/** Stock : entier, jamais négatif. Plafond large pour détecter une saisie aberrante. */
export const MAX_STOCK = 1_000_000;

export function assertStock(value: number): number {
  if (!Number.isSafeInteger(value) || value < 0 || value > MAX_STOCK) {
    throw new CatalogError("STOCK_INVALIDE", `stock : entier entre 0 et ${MAX_STOCK}`);
  }
  return value;
}

/** Texte obligatoire, espaces superflus retirés, longueur bornée. */
export function requiredText(value: string, what: string, max: number): string {
  const text = value.trim().replace(/\s+/g, " ");
  // En caractères, comme PostgreSQL (`char_length`) : un emoji compte pour un (relecture S6-T02)
  if (!text || [...text].length > max) {
    throw new CatalogError("PRODUIT_INVALIDE", `${what} : obligatoire, ${max} caractères au plus`);
  }
  return text;
}

/**
 * Texte de recherche : minuscules, sans accents, seulement lettres, chiffres et espaces.
 * Même règle que `normalize()` du site, plus le retrait de la ponctuation : la recherche ne transmet
 * jamais de caractère spécial à la base (pas de joker « % » ou « _ » détourné).
 */
export function searchable(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}
