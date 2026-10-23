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
  // Double authentification de l'équipe (S6-T03, MED-15)
  "MOT_DE_PASSE_INCORRECT",
  "DEUX_FACTEURS_INDISPONIBLE",
  "DEUX_FACTEURS_A_CONFIGURER",
  "DEUX_FACTEURS_DEJA_ACTIVE",
  "DEUX_FACTEURS_A_ACTIVER",
  "DEUX_FACTEURS_REQUIS",
  // Équipe et appareils (S7.5-T04)
  "COMPTE_PROTEGE",
  "MOTIF_INVALIDE",
  "ALERTE_INVALIDE",
  // Photo de profil (S7.5-T08)
  "PHOTO_INVALIDE",
  "PHOTO_ABSENTE",
  // Bêta fermée (S8-T02) : inscription sur invitation
  "INVITATION_REQUISE",
  "INVITATION_INTROUVABLE",
  "INVITATION_UTILISEE",
  "COMPTE_EXISTANT",
] as const;
export type IdentityErrorCode = (typeof IDENTITY_ERROR_CODES)[number];

/** Code à usage unique : 6 chiffres. */
export const OTP_CODE_PATTERN = /^\d{6}$/;
/**
 * Code de secours de la double authentification (S6-T03) : « abcd-efgh-jkmn », sans 0, 1, i, l, o (illisibles).
 * Saisie tolérée par l'API : majuscules, espaces, tirets oubliés.
 */
export const RECOVERY_CODE_PATTERN = /^[a-z2-9]{4}-[a-z2-9]{4}-[a-z2-9]{4}$/;
/** Codes de secours donnés à l'activation (et à chaque renouvellement). */
export const RECOVERY_CODE_COUNT = 10;
/** Durée d'une confirmation par la double authentification : les routes d'équipe la redemandent après 15 minutes. */
export const SECOND_FACTOR_MINUTES = 15;
/** Ticket d'inscription : 32 octets en base64url (43 caractères). */
export const SIGNUP_TICKET_PATTERN = /^[A-Za-z0-9_-]{43}$/;
/** Jeton de session (cookie du site, en-tête `Authorization: Bearer …` vers l'API) : 32 octets en base64url. */
export const SESSION_TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;
/** Durée d'une session sans visite : 30 jours, prolongés à chaque visite (ADR-0017). */
export const SESSION_TTL_DAYS = 30;
/**
 * Identifiant d'appareil (S7.5-T04) : 32 octets aléatoires en base64url, dans un cookie du site. L'API n'en garde que
 * l'empreinte ; il sert à reconnaître un appareil déjà utilisé, jamais à ouvrir une session.
 */
export const DEVICE_ID_PATTERN = /^[A-Za-z0-9_-]{43}$/;
/** Jeton du lien « ce n'est pas moi » d'un avis de nouvel appareil : 32 octets en base64url, 7 jours. */
export const DEVICE_ALERT_TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;
export const DEVICE_ALERT_DAYS = 7;
/** Appareils retenus par compte : au-delà, le moins récemment utilisé est oublié. */
export const KNOWN_DEVICES_MAX = 20;
/** Avis « nouvel appareil » encore valables par compte : au-delà, l'appareil est retenu sans nouvel e-mail. */
export const DEVICE_ALERTS_MAX = 5;
/** Un appareil pas revu depuis ce nombre de jours est oublié (son cookie a expiré). */
export const KNOWN_DEVICE_RETENTION_DAYS = 365;
/** Équipe (S7.5-T04) : motif d'une désactivation, membres par page. */
export const STAFF_LIMITS = {
  reasonMin: 5,
  reasonMax: 300,
  pageDefault: 50,
  pageMax: 100,
} as const;
/** Canaux d'envoi des codes. */
export const OTP_CHANNELS = ["email", "sms"] as const;

// --- Rôles et journal d'audit (S4-T06, ADR-0020) ---

/**
 * Rôles d'un compte, cumulables. `client` : tout compte actif. Équipe (S7.5-T04, ADR-0051) : `catalog` (produits,
 * fiches, boutiques, vérifications), `logistics` (livraisons), `finance` (paiements, remboursements, encaissements,
 * factures, codes promo), `support` (service client, lecture seule), `admin` (tout, et les utilisateurs).
 */
export const ROLES = [
  "client",
  "vendor",
  "catalog",
  "logistics",
  "finance",
  "support",
  "admin",
] as const;
export type Role = (typeof ROLES)[number];
/** Rôles de l'équipe Kemdia (double authentification obligatoire). */
export const STAFF_ROLES = ["catalog", "logistics", "finance", "support", "admin"] as const;
export type StaffRole = (typeof STAFF_ROLES)[number];
/** Un administrateur a les droits de tous les autres rôles de l'équipe. */
export const ROLE_IMPLIES: Readonly<Record<Role, readonly Role[]>> = {
  client: [],
  vendor: [],
  catalog: [],
  logistics: [],
  finance: [],
  support: [],
  admin: ["catalog", "logistics", "finance", "support"],
};
/** Ces rôles donnent-ils les droits de `required` ? (même règle que l'API) */
export function hasRole(roles: readonly Role[], required: Role): boolean {
  return roles.some((role) => role === required || ROLE_IMPLIES[role].includes(required));
}
/** Ces rôles font-ils partie de l'équipe ? */
export function isStaffRoles(roles: readonly Role[]): boolean {
  return roles.some((role) => (STAFF_ROLES as readonly Role[]).includes(role));
}
/** Rôles qu'un administrateur peut accorder ou retirer par l'API (`admin` : commande serveur seulement). */
export const ADMIN_ASSIGNABLE_ROLES = [
  "vendor",
  "catalog",
  "logistics",
  "finance",
  "support",
] as const;
export type AssignableRole = (typeof ADMIN_ASSIGNABLE_ROLES)[number];
/** Libellés affichés par le site. */
export const ROLE_LABELS: Readonly<Record<Role, string>> = {
  client: "Client",
  vendor: "Vendeur",
  catalog: "Catalogue",
  logistics: "Logistique",
  finance: "Finance",
  support: "Service client",
  admin: "Administrateur",
};
/** Actions inscrites au journal d'audit (liste fermée, même liste que le module audit de l'API). */
export const AUDIT_ACTIONS = [
  "role.granted",
  "role.revoked",
  "password.reset",
  // Changement du mot de passe depuis « Mon compte » (S7-T07)
  "password.changed",
  "password.change_failed",
  "password.change_locked",
  // Données personnelles (S7-T08)
  "account.data_exported",
  "account.deleted",
  "account.delete_failed",
  "account.delete_locked",
  "account.inactivity_notified",
  "sessions.revoked_all",
  // Coupons (S5-T03)
  "coupon.created",
  "coupon.updated",
  // Paiements (S5-T04)
  "order.cancelled_by_admin",
  "refund.done",
  "cod.collected",
  "settings.cod_updated",
  // Factures (S5-T06)
  "settings.billing_updated",
  // Boutiques des vendeurs (S6-T01)
  "shop.requested",
  "shop.approved",
  "shop.rejected",
  "shop.suspended",
  // « Ma boutique » : ville, quartier, description (S7.5-T07)
  "shop.profile_updated",
  // Avis des clients (S8-T01)
  "review.published",
  "review.rejected",
  // Produits des vendeurs et modération (S6-T02)
  "product.submitted",
  "product.approved",
  "product.rejected",
  "product.archived",
  "product.variant_updated",
  // Photos (S6-T04)
  "product.image_removed",
  "product.images_reordered",
  // Double authentification de l'équipe (S6-T03)
  "mfa.enabled",
  "mfa.recovery_used",
  "mfa.recovery_regenerated",
  "mfa.failed",
  "mfa.locked",
  "mfa.reset",
  // Commandes des vendeurs (S6-T07)
  "order.vendor_accepted",
  "order.vendor_refused",
  "order.vendor_timeout",
  // Vérification des vendeurs (S6-T08)
  "kyc.updated",
  "kyc.document_added",
  "kyc.submitted",
  "kyc.viewed",
  "kyc.document_viewed",
  "kyc.approved",
  "kyc.rejected",
  // Livraisons (S7-T01)
  "settings.delivery_updated",
  "shipment.handed_over",
  "shipment.delivered",
  "shipment.failed",
  "shipment.retried",
  "shipment.cancelled",
  // Fiches communes et offres (S7.5-T02)
  "offer.created",
  "offer.variant_added",
  "offer.restored",
  "offer.withdrawn",
  "listing.updated",
  "listing.image_removed",
  "listing.merged",
  // Propositions de correction (S7.5-T03)
  "listing.correction_proposed",
  "listing.correction_closed",
  // Équipe et utilisateurs (S7.5-T04)
  "account.disabled",
  "account.enabled",
  "staff.removed",
  "support.account_viewed",
  "support.lookup_failed",
  "support.orders_viewed",
  // Finance (S7.5-T05)
  "invoice.downloaded",
  "invoice.resent",
  // Appareils (S7.5-T04)
  "device.new_login",
  "device.not_me",
  // Bêta fermée et signalements (S8-T02)
  "settings.beta_updated",
  "beta.invited",
  "beta.invitation_revoked",
  "problem.updated",
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
/**
 * Raisons d'une annulation : par le client, faute de paiement à temps, par un administrateur (S5-T04, service client),
 * refusée par un vendeur ou sans réponse d'un vendeur dans le délai (S6-T07, BR-013).
 */
export const CANCEL_REASONS = [
  "client",
  "paiement_expire",
  "admin",
  "vendeur_refus",
  "vendeur_delai",
  // Livraison impossible, commande annulée par un administrateur (S7-T01)
  "livraison_echec",
] as const;
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
  // Aucun fournisseur Mobile Money sur cet environnement (S5-T07) : seul le paiement à la livraison est possible
  "MOBILE_MONEY_INDISPONIBLE",
  // Commandes des vendeurs (S6-T07) : la commande n'attend plus la décision de cette boutique (déjà décidée, annulée,
  // délai passé)
  "DECISION_IMPOSSIBLE",
  // Motif de refus d'un vendeur trop court ou trop long
  "MOTIF_REFUS_INVALIDE",
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

// --- Paiements (S5-T04, ADR-0026) ---

/** États d'une tentative de paiement Mobile Money (ou d'un encaissement à la livraison). */
export const PAYMENT_STATUSES = ["pending", "succeeded", "failed", "expired"] as const;
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];
/** Essais Mobile Money au plus par commande (choix du 2026-10-10). */
export const MAX_PAYMENT_ATTEMPTS = 3;
/** Durée d'un essai : au-delà, sans réponse de l'opérateur, l'essai est expiré et le client peut réessayer. */
export const PAYMENT_ATTEMPT_MINUTES = 3;

// --- Notifications de l'opérateur (S5-T05, ADR-0027) ---

/**
 * En-tête de signature d'une notification de paiement : `t=<secondes Unix>,v1=<HMAC-SHA256 hexadécimal>`, calculé sur
 * `<t>.<corps brut>` avec la clé partagée avec l'opérateur.
 */
export const PAYMENT_SIGNATURE_HEADER = "x-kemdia-signature";
/** Notification signée il y a plus de 5 minutes (ou dans plus de 5 minutes) : refusée (choix du 2026-10-11). */
export const PAYMENT_SIGNATURE_TOLERANCE_SECONDS = 300;
/** Types de notification envoyés par l'opérateur. */
export const PAYMENT_NOTIFICATION_TYPES = ["payment.succeeded", "payment.failed"] as const;
export type PaymentNotificationType = (typeof PAYMENT_NOTIFICATION_TYPES)[number];
/** Téléphone simulé : code PIN fictif à 4 chiffres ; solde fictif de chaque compte Mobile Money du bac à sable. */
export const SANDBOX_PIN_PATTERN = /^\d{4}$/;
export const SANDBOX_BALANCE = 500_000;

// --- Factures (S5-T06, ADR-0028) ---

/** Facture (au paiement reçu) ou avoir (commande facturée puis annulée). */
export const INVOICE_KINDS = ["invoice", "credit_note"] as const;
export type InvoiceKind = (typeof INVOICE_KINDS)[number];
/** « KMD-F-2026-000001 » (facture) ou « KMD-A-2026-000001 » (avoir) : par année, sans trou (choix du 2026-10-11). */
export const INVOICE_NUMBER_PATTERN = /^KMD-[FA]-\d{4}-\d{6}$/;
/** Mention par défaut : sous le seuil de 25 millions de FCFA (BR-023), en attendant l'expert-comptable (question 6). */
export const DEFAULT_VAT_MENTION = "TVA non applicable";
/** États d'un remboursement (suivi manuel par l'administrateur en attendant le fournisseur). */
export const REFUND_STATUSES = ["to_do", "done"] as const;
export type RefundStatus = (typeof REFUND_STATUSES)[number];
/**
 * Raisons d'un remboursement : commande payée puis annulée par l'administrateur, ou argent reçu alors que la commande
 * n'attendait plus de paiement (annulée entre-temps, ou déjà payée par un autre essai).
 */
export const REFUND_REASONS = [
  "annulation_admin",
  "paiement_non_attendu",
  // Commande payée puis refusée par un vendeur, ou sans réponse d'un vendeur à temps (S6-T07)
  "annulation_vendeur",
  // Commande payée, livraison impossible puis annulée (S7-T01)
  "annulation_livraison",
] as const;
export type RefundReason = (typeof REFUND_REASONS)[number];

/** Codes d'erreur métier des paiements. */
export const PAYMENT_ERROR_CODES = [
  "PAIEMENT_IMPOSSIBLE",
  "PAIEMENT_EN_COURS",
  "TROP_D_ESSAIS_PAIEMENT",
  "PAIEMENT_INDISPONIBLE",
  "PAIEMENT_INTROUVABLE",
  "REMBOURSEMENT_INTROUVABLE",
  "ENCAISSEMENT_IMPOSSIBLE",
  "REMBOURSEMENT_DEJA_FAIT",
  // Notifications de l'opérateur et bac à sable (S5-T05, ADR-0027)
  "SIGNATURE_INVALIDE",
  "NOTIFICATION_EXPIREE",
  "DEMANDE_INTROUVABLE",
  "CODE_PIN_INVALIDE",
  // Factures (S5-T06)
  "FACTURE_INTROUVABLE",
  "ENVOI_IMPOSSIBLE",
] as const;
export type PaymentErrorCode = (typeof PAYMENT_ERROR_CODES)[number];

// --- Boutiques des vendeurs (S6-T01, ADR-0032) ---

/**
 * Statuts d'une boutique : `pending` (demande à examiner), `active` (validée : le compte a le rôle vendeur),
 * `rejected` (refusée, le motif est montré au demandeur, qui peut redemander), `suspended` (suspendue : rôle retiré).
 */
export const SHOP_STATUSES = ["pending", "active", "rejected", "suspended"] as const;
export type ShopStatus = (typeof SHOP_STATUSES)[number];
/** `kemdia` : la boutique de Kemdia (produits vendus par Kemdia, sans commission ni validation) ; `partner` : vendeur tiers. */
export const SHOP_KINDS = ["kemdia", "partner"] as const;
export type ShopKind = (typeof SHOP_KINDS)[number];
/** Identifiant fixe de la boutique Kemdia (« kemdia » en hexadécimal) : les produits existants lui appartiennent. */
export const KEMDIA_SHOP_ID = "6b656d64-6961-4000-8000-000000000001";

/** Propositions de correction d'une fiche (S7.5-T03) : longueurs et file par boutique. */
export const LISTING_CORRECTION_LIMITS = {
  messageMin: 10,
  messageMax: 500,
  noteMax: 300,
  openPerShop: 10,
} as const;
/** Longueurs des champs d'une demande de boutique (mêmes valeurs dans la migration SQL). */
export const SHOP_LIMITS = {
  nameMin: 3,
  nameMax: 60,
  cityMin: 2,
  cityMax: 60,
  descriptionMin: 20,
  descriptionMax: 500,
  reasonMin: 5,
  reasonMax: 300,
} as const;
/** Boutiques par page (administration). */
export const SHOP_PAGE_DEFAULT = 50;
export const SHOP_PAGE_MAX = 100;

// --- Produits des vendeurs et modération (S6-T02, ADR-0033) ---

/** Statuts d'un produit de vendeur, vus par le vendeur et la modération. */
export const VENDOR_PRODUCT_STATUSES = [
  "draft",
  "pending",
  "published",
  "rejected",
  "archived",
] as const;
export type VendorProductStatus = (typeof VENDOR_PRODUCT_STATUSES)[number];
/** Limites des produits d'un vendeur (mêmes valeurs dans le domaine et la migration SQL). */
export const VENDOR_PRODUCT_LIMITS = {
  titleMin: 5,
  titleMax: 120,
  descriptionMin: 30,
  descriptionMax: 5_000,
  brandMin: 2,
  brandMax: 60,
  variantsMax: 20,
  variantNameMax: 80,
  reasonMin: 5,
  reasonMax: 300,
} as const;
/**
 * Photos des produits des vendeurs (S6-T04, ADR-0035) : JPEG, PNG ou WebP reçus (vérifiés par leur contenu),
 * réencodés en WebP sans métadonnées, en deux tailles (grande et vignette). Mêmes valeurs dans l'API et la base.
 */
export const PRODUCT_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
export const PRODUCT_IMAGE_LIMITS = {
  /** Fichier reçu, en octets (5 Mo) */
  maxUploadBytes: 5 * 1024 * 1024,
  /** Photos au plus par produit (MAX_IMAGES du catalogue) */
  maxPerProduct: 10,
  /** Plus petit côté accepté, en pixels */
  minSide: 200,
  /** Plus grand côté de la grande image et de la vignette, en pixels */
  largeSide: 1600,
  smallSide: 480,
  /** Taille maximale d'une image réencodée gardée en base, en octets (2 Mo) */
  maxStoredBytes: 2 * 1024 * 1024,
} as const;
/** Adresse publique d'une photo de vendeur sur le site : « /images/v/<uuid>.webp » (vignette : « …-480.webp »). */
export const VENDOR_IMAGE_PATH_PATTERN =
  /^\/images\/v\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.webp$/;

/** Produits d'une boutique en attente de modération au plus (la file ne s'inonde pas). */
export const MAX_PENDING_PRODUCTS_PER_SHOP = 50;
export const VENDOR_PRODUCT_PAGE_DEFAULT = 50;
export const VENDOR_PRODUCT_PAGE_MAX = 100;

// --- Commandes des vendeurs (S6-T07, ADR-0038) ---

/**
 * Délai du vendeur pour accepter ou refuser sa part d'une commande, à partir de la confirmation de la commande (payée,
 * ou paiement à la livraison) — BR-013, choix du 2026-10-17. Sans réponse : la commande entière est annulée.
 */
export const VENDOR_ORDER_RESPONSE_HOURS = 24;
/**
 * Une commande vue par un vendeur : `pending` (à accepter ou refuser), `accepted`, `refused` (par lui), `expired` (pas
 * de réponse à temps), `cancelled` (annulée autrement : par le client, l'équipe, un autre vendeur, faute de paiement).
 */
export const VENDOR_ORDER_STATUSES = [
  "pending",
  "accepted",
  "refused",
  "expired",
  "cancelled",
] as const;
export type VendorOrderStatus = (typeof VENDOR_ORDER_STATUSES)[number];
/** Motif d'un refus (mêmes valeurs dans la migration SQL). Il reste chez Kemdia : jamais montré au client. */
export const VENDOR_ORDER_REFUSAL_LIMITS = { min: 5, max: 300 } as const;

// --- Vérification des vendeurs, KYC (S6-T08, ADR-0039 ; BR-024) ---

/** draft : en préparation ; pending : envoyé, attend l'équipe ; approved : validé ; rejected : refusé (motif). */
export const KYC_STATUSES = ["draft", "pending", "approved", "rejected"] as const;
export type KycStatus = (typeof KYC_STATUSES)[number];
/** Personne seule, ou entreprise (RCCM obligatoire). */
export const KYC_HOLDER_KINDS = ["individual", "company"] as const;
export type KycHolderKind = (typeof KYC_HOLDER_KINDS)[number];
/** Pièce d'identité : carte nationale, passeport, carte de séjour. */
export const KYC_ID_TYPES = ["cni", "passeport", "carte_sejour"] as const;
export type KycIdType = (typeof KYC_ID_TYPES)[number];
/** Compte de versement : Airtel Money, Moov Money ou compte bancaire. */
export const KYC_PAYOUT_METHODS = ["airtel", "moov", "bank"] as const;
export type KycPayoutMethod = (typeof KYC_PAYOUT_METHODS)[number];
/** Photos du dossier : pièce (recto, verso) et extrait RCCM. */
export const KYC_DOCUMENT_KINDS = ["id_front", "id_back", "rccm"] as const;
export type KycDocumentKind = (typeof KYC_DOCUMENT_KINDS)[number];
/** Photos effacées ce nombre de jours après la décision (choix du 2026-10-17, à confirmer avec le client). */
export const KYC_DOCUMENT_RETENTION_DAYS = 30;
export const KYC_LIMITS = {
  nameMin: 2,
  nameMax: 100,
  idNumberMin: 4,
  idNumberMax: 30,
  rccmMin: 5,
  rccmMax: 40,
  bankAccountMin: 10,
  bankAccountMax: 34,
} as const;
export const VENDOR_ORDER_PAGE_DEFAULT = 20;
export const VENDOR_ORDER_PAGE_MAX = 50;

/** Codes d'erreur métier des boutiques. */
export const VENDOR_ERROR_CODES = [
  "BOUTIQUE_INVALIDE",
  "BOUTIQUE_EXISTE",
  "NOM_BOUTIQUE_PRIS",
  "BOUTIQUE_INTROUVABLE",
  "STATUT_BOUTIQUE_INCOMPATIBLE",
  "BOUTIQUE_SUR_SOI_INTERDITE",
  "PROPRIETAIRE_INACTIF",
  // Une autre opération verrouille la boutique : réessayer dans un instant
  "BOUTIQUE_OCCUPEE",
  // Produits des vendeurs et modération (S6-T02)
  "BOUTIQUE_INACTIVE",
  "PRODUIT_INVALIDE",
  "CATEGORIE_INCONNUE",
  "PRODUIT_INTROUVABLE",
  "VARIANTE_INTROUVABLE",
  "STATUT_PRODUIT_INCOMPATIBLE",
  "PRODUIT_SUR_SOI_INTERDIT",
  // Le stock disponible a changé (commande) depuis que le vendeur l'a lu : le relire
  "STOCK_MODIFIE",
  // Le produit a changé depuis que le modérateur l'a lu : relire avant de décider
  "PRODUIT_MODIFIE",
  "TROP_DE_PRODUITS_EN_ATTENTE",
  // Photos des produits (S6-T04)
  "FORMAT_IMAGE_INVALIDE",
  "IMAGE_TROP_GRANDE",
  "IMAGE_TROP_PETITE",
  "TROP_DE_PHOTOS",
  "PHOTO_INTROUVABLE",
  // Vérification des vendeurs, KYC (S6-T08)
  "KYC_INVALIDE",
  "KYC_INTROUVABLE",
  "KYC_INCOMPLET",
  "STATUT_KYC_INCOMPATIBLE",
  "KYC_INDISPONIBLE",
  "DOCUMENT_INTROUVABLE",
  // Fiches communes et offres (S7.5-T02)
  "FICHE_INTROUVABLE",
  // La fiche est en ligne : seule l'équipe la modifie (le vendeur propose une correction)
  "FICHE_PUBLIEE",
  "FICHE_NON_PUBLIEE",
  // La boutique vend déjà ce produit : modifier l'offre existante
  "DEJA_EN_VENTE",
  "DECLINAISON_INTROUVABLE",
  "FUSION_IMPOSSIBLE",
  // Propositions de correction (S7.5-T03)
  "CORRECTION_INTROUVABLE",
  "TROP_DE_CORRECTIONS",
] as const;
export type VendorErrorCode = (typeof VENDOR_ERROR_CODES)[number];

// --- Livraisons (S7-T01, ADR-0040) ---

/**
 * Expédition d'une commande : en route (remise au transporteur), livrée, échec de livraison (nouvelle tentative ou
 * annulation), annulée. « À préparer » n'est pas un statut : c'est une commande prête sans expédition.
 */
export const SHIPMENT_STATUSES = ["in_transit", "delivered", "failed", "cancelled"] as const;
export type ShipmentStatus = (typeof SHIPMENT_STATUSES)[number];

/** BR-021 : part de Kemdia sur chaque frais de livraison facturé, arrondie à l'entier inférieur (choix du 2026-10-17). */
export const KEMDIA_DELIVERY_SHARE_PERCENT = 15;

export const SHIPPING_LIMITS = {
  /** Motif d'un échec de livraison, note d'une annulation */
  reasonMin: 3,
  reasonMax: 200,
  /** Barème : frais de base d'une zone, seuil de gratuité, délais en jours */
  baseFeeMax: 100_000,
  freeThresholdMax: 10_000_000,
  daysMax: 30,
  /** Lignes au plus dans une liste de l'administration */
  listMax: 100,
} as const;

/** Codes d'erreur métier des livraisons. */
export const SHIPPING_ERROR_CODES = [
  "EXPEDITION_INTROUVABLE",
  // La commande n'est pas prête (paiement, vendeur qui n'a pas répondu) ou a déjà une expédition
  "EXPEDITION_IMPOSSIBLE",
  "STATUT_EXPEDITION_INCOMPATIBLE",
  "EXPEDITION_INVALIDE",
  "TARIFS_INVALIDES",
] as const;
export type ShippingErrorCode = (typeof SHIPPING_ERROR_CODES)[number];

// --- Données personnelles (S7-T08, ADR-0047) ---

/**
 * Conservation des comptes (loi gabonaise n°001/2011 modifiée, art. 70 : pas plus longtemps que nécessaire) : un compte
 * sans connexion depuis 3 ans est effacé ; son titulaire est prévenu par e-mail 30 jours avant.
 * Les factures restent 10 ans (Acte uniforme OHADA relatif au droit comptable, art. 24), telles qu'émises (acheteur compris :
 * une facture ne change jamais) ; les commandes, elles, sont anonymisées.
 */
export const ACCOUNT_RETENTION = {
  inactiveYears: 3,
  noticeDays: 30,
  invoiceYears: 10,
} as const;

/** Avis des clients (S8-T01, ADR-0056). */
// « PRODUIT_INTROUVABLE » (fiche inconnue ou pas en ligne) est déjà dans les codes des vendeurs
export const REVIEW_ERROR_CODES = [
  "AVIS_INVALIDE",
  "ACHAT_REQUIS",
  "AVIS_INTROUVABLE",
  "AVIS_DEJA_TRAITE",
  "AVIS_MODIFIE",
] as const;
export type ReviewErrorCode = (typeof REVIEW_ERROR_CODES)[number];

/** Avis : note de 1 à 5, commentaire facultatif de 10 à 1 000 caractères, motif d'un refus de 5 à 300. */
export const REVIEW_LIMITS = {
  ratingMin: 1,
  ratingMax: 5,
  commentMin: 10,
  commentMax: 1000,
  reasonMin: 5,
  reasonMax: 300,
} as const;
export const REVIEW_STATUSES = ["pending", "published", "rejected"] as const;
export const REVIEW_PAGE_DEFAULT = 30;
export const REVIEW_PAGE_MAX = 100;

// --- Bêta fermée et « Signaler un problème » (S8-T02, ADR-0057) ---

/** Pour qui est l'invitation : un vendeur partenaire ou un testeur (les deux s'inscrivent comme clients). */
export const BETA_INVITATION_KINDS = ["partner_vendor", "tester"] as const;
export type BetaInvitationKind = (typeof BETA_INVITATION_KINDS)[number];
export const BETA_INVITATION_KIND_LABELS: Readonly<Record<BetaInvitationKind, string>> = {
  partner_vendor: "Vendeur partenaire",
  tester: "Testeur",
};
/** active : utilisable ; used : compte créé ; expired : plus de 30 jours ; revoked : annulée par l'équipe. */
export const BETA_INVITATION_STATUSES = ["active", "used", "expired", "revoked"] as const;
export type BetaInvitationStatus = (typeof BETA_INVITATION_STATUSES)[number];
/** Une invitation vaut 30 jours ; l'inviter de nouveau repart pour 30 jours. */
export const BETA_INVITATION_TTL_DAYS = 30;
export const BETA_INVITATION_PAGE_DEFAULT = 50;
export const BETA_INVITATION_PAGE_MAX = 100;

/** Signalements : genre du problème. */
export const PROBLEM_CATEGORIES = ["bug", "display", "payment", "delivery", "other"] as const;
export type ProblemCategory = (typeof PROBLEM_CATEGORIES)[number];
export const PROBLEM_CATEGORY_LABELS: Readonly<Record<ProblemCategory, string>> = {
  bug: "Quelque chose ne marche pas",
  display: "Affichage ou texte",
  payment: "Paiement",
  delivery: "Commande ou livraison",
  other: "Autre",
};
export const PROBLEM_STATUSES = ["new", "in_progress", "resolved"] as const;
export type ProblemStatus = (typeof PROBLEM_STATUSES)[number];
export const PROBLEM_STATUS_LABELS: Readonly<Record<ProblemStatus, string>> = {
  new: "Nouveau",
  in_progress: "En cours",
  resolved: "Résolu",
};
/**
 * Description de 10 à 2 000 caractères ; page (chemin du site, sans paramètres) de 200 au plus ; 20 signalements non
 * résolus au plus par compte ; un signalement résolu est effacé 180 jours après (minimisation, ADR-0047).
 */
export const PROBLEM_LIMITS = {
  messageMin: 10,
  messageMax: 2000,
  pageMax: 200,
  openPerAccount: 20,
  resolvedRetentionDays: 180,
} as const;
export const PROBLEM_PAGE_DEFAULT = 30;
export const PROBLEM_PAGE_MAX = 100;
export const PROBLEM_ERROR_CODES = [
  "SIGNALEMENT_INVALIDE",
  "TROP_DE_SIGNALEMENTS",
  "SIGNALEMENT_INTROUVABLE",
  "SIGNALEMENT_MODIFIE",
] as const;
export type ProblemErrorCode = (typeof PROBLEM_ERROR_CODES)[number];

/** Ce qui empêche de supprimer son compte maintenant (409). */
export const PRIVACY_ERROR_CODES = [
  // Commande pas encore livrée, annulée ou remboursée : il faut pouvoir livrer, rembourser, répondre
  "COMMANDE_EN_COURS",
  // Un remboursement reste à verser au client
  "REMBOURSEMENT_EN_ATTENTE",
  // Paiement Mobile Money sans réponse définitive de l'opérateur (en attente, ou expiré / échoué depuis moins de 24 h)
  "PAIEMENT_EN_ATTENTE",
  // Boutique en attente, ouverte ou suspendue : la fermer d'abord (commandes des clients, factures)
  "BOUTIQUE_OUVERTE",
  // Compte de l'équipe (administration, modération) : un administrateur retire d'abord ses rôles
  "COMPTE_EQUIPE",
] as const;
export type PrivacyErrorCode = (typeof PRIVACY_ERROR_CODES)[number];

/** Tous les codes d'erreur métier que l'API peut renvoyer. */
export const API_ERROR_CODES = [
  ...IDENTITY_ERROR_CODES,
  ...CART_ERROR_CODES,
  ...ORDER_ERROR_CODES,
  ...COUPON_ERROR_CODES,
  ...PAYMENT_ERROR_CODES,
  ...VENDOR_ERROR_CODES,
  ...SHIPPING_ERROR_CODES,
  ...PRIVACY_ERROR_CODES,
  ...REVIEW_ERROR_CODES,
  ...PROBLEM_ERROR_CODES,
] as const;
export type ApiErrorCode = (typeof API_ERROR_CODES)[number];

// --- Démonstration (S5-T08, ADR-0030) ---

/**
 * Code promo de démonstration : créé à l'import de la démo et sur le poste de développement SEULEMENT (jamais en
 * préproduction ni en production). 10 %, réduction de 10 000 FCFA au plus, une fois par compte.
 */
export const DEMO_COUPON = {
  code: "DEMO10",
  percent: 10,
  maxDiscount: 10_000,
  perAccountLimit: 1,
} as const;

/**
 * Photo de profil (S7.5-T08, ADR-0055) : JPEG, PNG ou WebP de 5 Mo au plus, 200 px au moins de chaque côté ; gardée en
 * carré de 256 px (WebP, sans métadonnées). Visible seulement par le titulaire du compte.
 */
export const AVATAR_LIMITS = {
  maxUploadBytes: 5 * 1024 * 1024,
  minSide: 200,
  side: 256,
  maxStoredBytes: 256 * 1024,
} as const;
export const AVATAR_VERSION_PATTERN = /^[0-9a-f]{16}$/;
