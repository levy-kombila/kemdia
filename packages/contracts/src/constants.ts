/**
 * Constantes du contrat HTTP. Ce fichier n'importe RIEN : il peut être utilisé par le navigateur
 * (`@kemdia/contracts/constants`) sans embarquer Zod.
 */

/** En-tête par lequel le serveur du site s'identifie auprès de l'API (exempté de la limitation de débit). */
export const INTERNAL_KEY_HEADER = "x-kemdia-internal-key";

/** Tris disponibles. « ventes » : les plus demandés d'abord (nombre d'avis, en attendant les ventes réelles du S5). */
export const SORT_KEYS = [
  "pertinence",
  "nouveautes",
  "prix-asc",
  "prix-desc",
  "note",
  "ventes",
] as const;
export type SortKey = (typeof SORT_KEYS)[number];

/** Sélections éditoriales de l'accueil : produit mis en avant, nouveauté, meilleure vente. */
export const BADGES = ["featured", "new", "bestseller"] as const;
export type Badge = (typeof BADGES)[number];

/** Tranches de prix des filtres (FCFA). Mêmes clés dans l'URL du site et dans les compteurs de l'API. */
export const PRICE_RANGES = [
  { key: "moins-50000", label: "Moins de 50 000 FCFA", min: 0, max: 49_999 },
  { key: "50000-150000", label: "50 000 à 150 000 FCFA", min: 50_000, max: 150_000 },
  { key: "150000-300000", label: "150 000 à 300 000 FCFA", min: 150_001, max: 300_000 },
  { key: "plus-300000", label: "Plus de 300 000 FCFA", min: 300_001, max: 100_000_000 },
] as const;
export type PriceRangeKey = (typeof PRICE_RANGES)[number]["key"];

export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 48;
export const MAX_PAGE = 500;
export const MAX_QUERY_LENGTH = 100;
export const MAX_BRANDS = 10;

/** Quantité maximale d'une ligne de commande (même valeur que le domaine de l'API). */
export const MAX_ORDER_QUANTITY = 99;
/** Lignes au plus par vérification de disponibilité (un panier ne dépasse pas cette taille). */
export const MAX_AVAILABILITY_LINES = 100;

/** Raisons pour lesquelles une ligne n'est pas commandable (BR-001). */
export const AVAILABILITY_REASONS = [
  "PRODUIT_INDISPONIBLE",
  "VARIANTE_INCONNUE",
  "QUANTITE_INVALIDE",
  "STOCK_INSUFFISANT",
] as const;
export type AvailabilityReason = (typeof AVAILABILITY_REASONS)[number];

/** Format des identifiants publics (BR-042). */
export const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
/** Format des adresses lisibles (slug). */
export const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

// --- Identité (S4) ---

/**
 * Codes d'erreur métier de l'identité, renvoyés dans le champ `code` des erreurs (Problem Details).
 * Le site choisit son message à partir de ce code, jamais à partir du texte.
 */
export const IDENTITY_ERROR_CODES = [
  "IDENTIFIANT_INVALIDE",
  "NOM_INVALIDE",
  "MOT_DE_PASSE_FAIBLE",
  "CANAL_INDISPONIBLE",
  "ENVOI_TROP_RAPPROCHE",
  "TROP_D_ENVOIS",
  "CODE_INVALIDE",
  "CODE_EXPIRE",
  "TROP_D_ESSAIS",
  "COMPTE_BLOQUE",
] as const;
export type IdentityErrorCode = (typeof IDENTITY_ERROR_CODES)[number];

/** Code à usage unique : 6 chiffres. */
export const OTP_CODE_PATTERN = /^\d{6}$/;
/** Ticket d'inscription : 32 octets en base64url (43 caractères). */
export const SIGNUP_TICKET_PATTERN = /^[A-Za-z0-9_-]{43}$/;
/** Canaux d'envoi des codes. */
export const OTP_CHANNELS = ["email", "sms"] as const;
