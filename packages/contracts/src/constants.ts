/**
 * Constantes du contrat HTTP. Ce fichier n'importe RIEN : il peut être utilisé par le navigateur
 * (`@kemdia/contracts/constants`) sans embarquer Zod.
 */

/** En-tête par lequel le serveur du site s'identifie auprès de l'API (exempté de la limitation de débit). */
export const INTERNAL_KEY_HEADER = "x-kemdia-internal-key";
/**
 * Adresse IP du VISITEUR, transmise par le serveur du site (S4-T07, ADR-0021) : l'API ne la croit
 * qu'accompagnée de la bonne clé interne (limites par visiteur, journal d'audit).
 */
export const CLIENT_IP_HEADER = "x-kemdia-client-ip";

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
  "IDENTIFIANTS_INCORRECTS",
  "COMPTE_DESACTIVE",
  "SESSION_INVALIDE",
  // Rôles et administration (S4-T06)
  "ACCES_REFUSE",
  "RECONNEXION_REQUISE",
  "ROLE_NON_ATTRIBUABLE",
  "ROLE_SUR_SOI_INTERDIT",
  "COMPTE_INTROUVABLE",
  "COMPTE_INACTIF",
  // Limites par compte (S4-T07)
  "TROP_DE_REQUETES",
] as const;
export type IdentityErrorCode = (typeof IDENTITY_ERROR_CODES)[number];

/** Code à usage unique : 6 chiffres. */
export const OTP_CODE_PATTERN = /^\d{6}$/;
/** Ticket d'inscription : 32 octets en base64url (43 caractères). */
export const SIGNUP_TICKET_PATTERN = /^[A-Za-z0-9_-]{43}$/;
/** Jeton de session (cookie du site, en-tête `Authorization: Bearer …` vers l'API) : 32 octets en base64url. */
export const SESSION_TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;
/** Durée d'une session sans visite : 30 jours, prolongés à chaque visite (ADR-0017). */
export const SESSION_TTL_DAYS = 30;
/** Canaux d'envoi des codes. */
export const OTP_CHANNELS = ["email", "sms"] as const;

// --- Rôles et journal d'audit (S4-T06, ADR-0020) ---

/** Rôles d'un compte, cumulables. `client` : tout compte actif. */
export const ROLES = ["client", "vendor", "moderator", "admin"] as const;
export type Role = (typeof ROLES)[number];
/** Rôles qu'un administrateur peut accorder ou retirer par l'API (`admin` : commande serveur seulement). */
export const ADMIN_ASSIGNABLE_ROLES = ["vendor", "moderator"] as const;
export type AssignableRole = (typeof ADMIN_ASSIGNABLE_ROLES)[number];
/** Libellés affichés par le site. */
export const ROLE_LABELS: Readonly<Record<Role, string>> = {
  client: "Client",
  vendor: "Vendeur",
  moderator: "Modérateur",
  admin: "Administrateur",
};
/** Actions inscrites au journal d'audit (liste fermée, même liste que le module audit de l'API). */
export const AUDIT_ACTIONS = [
  "role.granted",
  "role.revoked",
  "password.reset",
  "sessions.revoked_all",
  // Coupons (S5-T03)
  "coupon.created",
  "coupon.updated",
] as const;
export type AuditAction = (typeof AUDIT_ACTIONS)[number];
/** Lignes par page du journal d'audit. */
export const AUDIT_PAGE_DEFAULT = 50;
export const AUDIT_PAGE_MAX = 100;

// --- Panier serveur (S5-T01, ADR-0023) ---

/** Lignes au plus dans un panier (même limite que le panier du navigateur). */
export const CART_MAX_LINES = 50;
/** Quantité au plus par ligne de panier (même limite que le panier du navigateur). */
export const CART_MAX_QUANTITY = 20;
/** Un panier sans activité depuis ce nombre de jours est supprimé (ménage automatique). */
export const CART_TTL_DAYS = 90;

/** Codes d'erreur métier du panier (champ `code` des erreurs). */
export const CART_ERROR_CODES = [
  "PANIER_PLEIN",
  "PRODUIT_INDISPONIBLE",
  "VARIANTE_INCONNUE",
  // Le panier est déjà en cours de modification (demandes simultanées) : réessayer dans un instant
  "PANIER_OCCUPE",
] as const;
export type CartErrorCode = (typeof CART_ERROR_CODES)[number];

// --- Commandes (S5-T02, ADR-0024) ---

/** Moyens de paiement : Airtel Money, Moov Money, à la livraison. */
export const PAYMENT_METHODS = ["airtel", "moov", "cod"] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

/**
 * Statuts d'une commande. En attente de paiement (Mobile Money) → confirmée → en préparation → expédiée → livrée ;
 * annulée (par le client avant l'expédition, ou paiement non reçu à temps).
 */
export const ORDER_STATUSES = [
  "pending_payment",
  "confirmed",
  "preparing",
  "shipped",
  "delivered",
  "cancelled",
] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];
export const ORDER_STATUS_LABELS: Readonly<Record<OrderStatus, string>> = {
  pending_payment: "En attente de paiement",
  confirmed: "Confirmée",
  preparing: "En préparation",
  shipped: "Expédiée",
  delivered: "Livrée",
  cancelled: "Annulée",
};
/** Raisons d'une annulation. */
export const CANCEL_REASONS = ["client", "paiement_expire"] as const;
export type CancelReason = (typeof CANCEL_REASONS)[number];

/**
 * Numéro de commande montré au client : « KMD- » + 6 caractères tirés au hasard (BR-042 : jamais des numéros qui se
 * suivent). Alphabet sans 0/O ni 1/I, pour le dicter au téléphone ou sur WhatsApp.
 */
export const ORDER_REFERENCE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export const ORDER_REFERENCE_PATTERN = /^KMD-[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{6}$/;
/** Délai pour valider un paiement Mobile Money ; ensuite la commande est annulée et le stock remis en vente. */
export const PAYMENT_WINDOW_MINUTES = 30;
/**
 * Commandes ouvertes (en attente de paiement, confirmées, en préparation) au plus par compte : un compte ne peut pas
 * bloquer le stock avec des commandes jamais payées (relecture de sécurité du S5-T02). Valeur proposée, à confirmer.
 */
export const MAX_OPEN_ORDERS = 3;
/** Commandes par page (« Mes commandes »). */
export const ORDER_PAGE_DEFAULT = 10;
export const ORDER_PAGE_MAX = 50;

/** Codes d'erreur métier des commandes. */
export const ORDER_ERROR_CODES = [
  "PANIER_VIDE",
  "PANIER_A_VERIFIER",
  "PRIX_MODIFIE",
  "ADRESSE_INVALIDE",
  "NUMERO_PAIEMENT_INVALIDE",
  "PAIEMENT_A_LA_LIVRAISON_INDISPONIBLE",
  "COMMANDE_INTROUVABLE",
  "ANNULATION_IMPOSSIBLE",
  // La même clé d'idempotence a déjà servi pour une commande DIFFÉRENTE (adresse, paiement ou total)
  "CLE_DEJA_UTILISEE",
  // Trop de commandes encore ouvertes (non expédiées) sur ce compte : limite contre le blocage du stock
  "TROP_DE_COMMANDES_OUVERTES",
] as const;
export type OrderErrorCode = (typeof ORDER_ERROR_CODES)[number];

// --- Coupons (S5-T03, ADR-0025) ---

/** Réduction en pourcentage (plafond possible en FCFA) ou montant fixe en FCFA. */
export const COUPON_KINDS = ["percent", "fixed"] as const;
export type CouponKind = (typeof COUPON_KINDS)[number];
/** Code : 4 à 20 lettres, chiffres ou tirets (sans casse : enregistré en majuscules), commence et finit par une lettre ou un chiffre. */
export const COUPON_CODE_PATTERN = /^[A-Za-z0-9][A-Za-z0-9-]{2,18}[A-Za-z0-9]$/;
/** Pourcentage au plus (une réduction de 100 % serait une erreur de saisie). */
export const COUPON_PERCENT_MAX = 90;
/** Bornes des réglages d'un coupon (au-delà : erreur de saisie probable). */
export const COUPON_LIMITS = {
  fixedMax: 10_000_000,
  maxDiscountMax: 10_000_000,
  minSubtotalMax: 100_000_000,
  usageLimitMax: 1_000_000,
  perAccountLimitMax: 1_000,
} as const;
/** Coupons par page (administration). */
export const COUPON_PAGE_DEFAULT = 50;
export const COUPON_PAGE_MAX = 100;

/** Codes d'erreur métier des coupons. */
export const COUPON_ERROR_CODES = [
  "COUPON_INVALIDE",
  "COUPON_EXPIRE",
  "COUPON_EPUISE",
  "COUPON_DEJA_UTILISE",
  "COUPON_MINIMUM_NON_ATTEINT",
  "COUPON_NON_APPLICABLE",
  "COUPON_EXISTE",
  "COUPON_INTROUVABLE",
  // Trop de codes refusés d'affilée pour ce compte : on n'essaie pas des codes au hasard
  "COUPON_TROP_D_ESSAIS",
] as const;
export type CouponErrorCode = (typeof COUPON_ERROR_CODES)[number];

/** Tous les codes d'erreur métier que l'API peut renvoyer. */
export const API_ERROR_CODES = [
  ...IDENTITY_ERROR_CODES,
  ...CART_ERROR_CODES,
  ...ORDER_ERROR_CODES,
  ...COUPON_ERROR_CODES,
] as const;
export type ApiErrorCode = (typeof API_ERROR_CODES)[number];
