import { z } from "zod";
import {
  API_ERROR_CODES,
  AVAILABILITY_REASONS,
  ADMIN_ASSIGNABLE_ROLES,
  AUDIT_ACTIONS,
  AUDIT_PAGE_DEFAULT,
  AUDIT_PAGE_MAX,
  CANCEL_REASONS,
  PAYMENT_STATUSES,
  REFUND_REASONS,
  REFUND_STATUSES,
  PAYMENT_NOTIFICATION_TYPES,
  PAYMENT_SIGNATURE_HEADER,
  SANDBOX_PIN_PATTERN,
  INVOICE_KINDS,
  INVOICE_NUMBER_PATTERN,
  COUPON_CODE_PATTERN,
  COUPON_KINDS,
  COUPON_LIMITS,
  COUPON_PAGE_DEFAULT,
  COUPON_PAGE_MAX,
  COUPON_PERCENT_MAX,
  CART_MAX_LINES,
  CART_MAX_QUANTITY,
  ORDER_PAGE_DEFAULT,
  ORDER_PAGE_MAX,
  ORDER_REFERENCE_PATTERN,
  ORDER_STATUSES,
  PAYMENT_METHODS,
  ROLES,
  MAX_AVAILABILITY_LINES,
  MAX_ORDER_QUANTITY,
  OTP_CHANNELS,
  OTP_CODE_PATTERN,
  SESSION_TOKEN_PATTERN,
  SIGNUP_TICKET_PATTERN,
  SLUG_PATTERN,
  SHOP_KINDS,
  SHOP_LIMITS,
  SHOP_PAGE_DEFAULT,
  SHOP_PAGE_MAX,
  SHOP_STATUSES,
} from "./constants.js";

/**
 * Contrat HTTP de l'API Kemdia : UNE seule définition, utilisée
 * 1. par l'API, pour valider les corps de requête et produire la documentation OpenAPI ;
 * 2. par le site, pour vérifier chaque réponse reçue de l'API ;
 * 3. par les tests des deux côtés.
 * Changer un schéma ici change l'API ET le site : TypeScript signale chaque endroit à adapter.
 */

const uuid = z.uuid().describe("Identifiant UUID (BR-042)");
const slug = z
  .string()
  .regex(SLUG_PATTERN)
  .describe("Adresse lisible (ex. « telephones-portables »)");
const fcfa = z.int().positive().describe("Montant en FCFA, entier (BR-004)");

// --- Erreurs et supervision ---

export const ProblemDetailsSchema = z
  .object({
    type: z.literal("about:blank"),
    title: z
      .string()
      .describe("Résumé en français (« Ressource introuvable », « Trop de requêtes »…)"),
    status: z.int().min(400).max(599),
    detail: z
      .string()
      .optional()
      .describe("Explication destinée au client (erreurs prévues uniquement)"),
    code: z
      .enum(API_ERROR_CODES)
      .optional()
      .describe(
        "Code d'erreur métier stable (ex. « CODE_INVALIDE ») : le site choisit son message à partir de lui",
      ),
    requestId: z
      .string()
      .optional()
      .describe("Identifiant à communiquer au support (en-tête X-Request-Id)"),
  })
  .meta({ id: "ProblemDetails", description: "Erreur au format Problem Details (RFC 9457)" });
export type ProblemDetails = z.infer<typeof ProblemDetailsSchema>;

export const HealthSchema = z
  .object({
    status: z.enum(["ok", "degrade"]),
    version: z.string(),
    environment: z.enum(["local", "demo", "staging", "production"]),
    checks: z.object({ database: z.enum(["ok", "indisponible"]) }),
  })
  .meta({ id: "Health", description: "État de l'API et de la base de données" });
export type Health = z.infer<typeof HealthSchema>;

// --- Catégories ---

export const CategorySchema = z
  .object({
    id: uuid,
    slug,
    name: z.string(),
    parentId: uuid.nullable(),
    icon: z.string().describe("Nom d'icône du site"),
    image: z.string().nullable(),
  })
  .meta({ id: "Category", description: "Catégorie du catalogue" });
export type Category = z.infer<typeof CategorySchema>;

export interface CategoryNode extends Category {
  children: CategoryNode[];
}

export const CategoryNodeSchema: z.ZodType<CategoryNode> = CategorySchema.extend({
  get children(): z.ZodArray<z.ZodType<CategoryNode>> {
    return z.array(CategoryNodeSchema);
  },
}).meta({
  id: "CategoryNode",
  description: "Catégorie et ses sous-catégories (3 niveaux au plus, BR-005)",
});

export const CategoryTreeSchema = z
  .object({ items: z.array(CategoryNodeSchema) })
  .meta({ id: "CategoryTree" });
export type CategoryTree = z.infer<typeof CategoryTreeSchema>;

export const CategoryViewSchema = z
  .object({
    category: CategorySchema,
    path: z.array(CategorySchema).describe("Fil d'Ariane, de la racine à la catégorie incluse"),
    children: z.array(CategorySchema),
  })
  .meta({ id: "CategoryView" });
export type CategoryView = z.infer<typeof CategoryViewSchema>;

// --- Produits ---

export const ProductSummarySchema = z
  .object({
    id: uuid,
    slug,
    title: z.string(),
    brand: z.string().nullable(),
    categoryId: uuid,
    image: z.string().nullable(),
    price: fcfa.describe("Prix « à partir de » (variante active la moins chère)"),
    compareAtPrice: fcfa.nullable().describe("Prix barré, toujours supérieur au prix"),
    inStock: z.boolean().describe("Au moins une variante active a du stock"),
    variantId: uuid.describe(
      "Variante proposée par défaut (la moins chère) : celle ajoutée au panier depuis une liste",
    ),
    stock: z.int().nonnegative().describe("Stock de la variante par défaut"),
    variantCount: z
      .int()
      .min(1)
      .describe("Nombre de variantes actives (au-delà de 1 : choix sur la fiche)"),
    rating: z.number().min(0).max(5),
    reviewCount: z.int().nonnegative(),
    isFeatured: z.boolean(),
    isBestseller: z.boolean(),
    isNew: z.boolean(),
  })
  .meta({ id: "ProductSummary", description: "Produit dans une liste (carte produit)" });
export type ProductSummary = z.infer<typeof ProductSummarySchema>;

export const ProductPageSchema = z
  .object({
    items: z.array(ProductSummarySchema),
    page: z.int().min(1),
    pageSize: z.int().min(1),
    total: z.int().nonnegative(),
    totalPages: z.int().min(1),
  })
  .meta({ id: "ProductPage" });
export type ProductPage = z.infer<typeof ProductPageSchema>;

export const VariantSchema = z
  .object({
    id: uuid,
    sku: z.string().describe("Référence interne"),
    name: z.string(),
    attributes: z
      .record(z.string(), z.string())
      .describe("Caractéristiques : { couleur, taille… }"),
    price: fcfa,
    compareAtPrice: fcfa.nullable(),
    stock: z.int().nonnegative(),
    available: z.boolean().describe("Commandable maintenant (BR-001)"),
  })
  .meta({ id: "Variant", description: "Variante d'un produit, avec son propre stock (FR-013)" });
export type Variant = z.infer<typeof VariantSchema>;

export const ProductDetailSchema = z
  .object({
    id: uuid,
    slug,
    title: z.string(),
    description: z.string(),
    brand: z.string().nullable(),
    category: CategorySchema.nullable(),
    path: z.array(CategorySchema).describe("Fil d'Ariane de la catégorie du produit"),
    images: z.array(z.string()),
    price: fcfa,
    compareAtPrice: fcfa.nullable(),
    inStock: z.boolean(),
    totalStock: z.int().nonnegative(),
    variantId: uuid.describe("Variante proposée par défaut (la moins chère)"),
    rating: z.number().min(0).max(5),
    reviewCount: z.int().nonnegative(),
    isFeatured: z.boolean(),
    isBestseller: z.boolean(),
    isNew: z.boolean(),
    variants: z.array(VariantSchema).min(1).describe("Variantes actives"),
  })
  .meta({ id: "ProductDetail", description: "Fiche produit" });
export type ProductDetail = z.infer<typeof ProductDetailSchema>;

export const FacetsSchema = z
  .object({
    brands: z.array(z.object({ name: z.string(), count: z.int().nonnegative() })),
    prices: z.array(z.object({ key: z.string(), count: z.int().nonnegative() })),
    inStock: z.int().nonnegative(),
    deals: z.int().nonnegative(),
    rating4: z.int().nonnegative(),
  })
  .meta({
    id: "Facets",
    description: "Compteurs affichés à côté des filtres, calculés AVANT application des filtres",
  });
export type Facets = z.infer<typeof FacetsSchema>;

// --- Disponibilité (BR-001) ---

export const AvailabilityRequestSchema = z
  .object({
    lines: z
      .array(
        z.strictObject({
          variantId: z.uuid(),
          quantity: z.int().min(1).max(MAX_ORDER_QUANTITY),
        }),
      )
      .min(1)
      .max(MAX_AVAILABILITY_LINES),
  })
  .strict()
  .meta({ id: "AvailabilityRequest", description: "Lignes d'un panier à vérifier (BR-001)" });
export type AvailabilityRequest = z.infer<typeof AvailabilityRequestSchema>;

export const AvailabilityResponseSchema = z
  .object({
    ok: z.boolean().describe("Toutes les lignes sont commandables"),
    lines: z.array(
      z.object({
        variantId: z.uuid(),
        quantity: z.int(),
        ok: z.boolean(),
        reason: z.enum(AVAILABILITY_REASONS).optional(),
        available: z
          .int()
          .nonnegative()
          .optional()
          .describe("Quantité restante (STOCK_INSUFFISANT)"),
      }),
    ),
  })
  .meta({ id: "AvailabilityResponse" });
export type AvailabilityResponse = z.infer<typeof AvailabilityResponseSchema>;

// --- Identité : inscription (S4-T02) ---

const ticket = z
  .string()
  .regex(SIGNUP_TICKET_PATTERN)
  .describe(
    "Ticket d'inscription, à garder côté serveur du site (cookie HttpOnly) ; jamais affiché",
  );

export const SignupRequestSchema = z
  .strictObject({
    firstName: z.string().max(100),
    lastName: z.string().max(100),
    identifier: z.string().max(300).describe("Adresse e-mail ou mobile gabonais (06… / 07…)"),
    password: z.string().max(200).describe("8 à 128 caractères, une lettre et un chiffre"),
    acceptTerms: z.literal(true).describe("Acceptation des conditions générales"),
  })
  .meta({
    id: "SignupRequest",
    description:
      "Inscription (FR-001). Les règles détaillées sont vérifiées par le serveur (erreur 422 avec un code).",
  });
export type SignupRequest = z.infer<typeof SignupRequestSchema>;

export const SignupStartedSchema = z
  .object({
    ticket,
    channel: z.enum(OTP_CHANNELS),
    sentTo: z.string().describe("Destination masquée (« aw•••@exemple.ga »)"),
    resendInSeconds: z.int().positive().describe("Délai avant de pouvoir redemander un code"),
  })
  .meta({
    id: "SignupStarted",
    description:
      "Code envoyé. Réponse IDENTIQUE que l'identifiant ait déjà un compte ou non (le titulaire reçoit alors une alerte).",
  });
export type SignupStarted = z.infer<typeof SignupStartedSchema>;

export const SignupVerifyRequestSchema = z
  .strictObject({ ticket, code: z.string().regex(OTP_CODE_PATTERN).describe("Code à 6 chiffres") })
  .meta({ id: "SignupVerifyRequest" });
export type SignupVerifyRequest = z.infer<typeof SignupVerifyRequestSchema>;

// --- Identité : compte et session (S4-T03) ---

export const AccountViewSchema = z
  .object({
    id: uuid,
    firstName: z.string(),
    lastName: z.string(),
    email: z.string().nullable(),
    phone: z.string().nullable().describe("Format +2410XXXXXXXX"),
    roles: z
      .array(z.enum(ROLES))
      .describe("Rôles cumulables (S4-T06) : toujours « client », puis vendor, moderator, admin"),
  })
  .meta({ id: "AccountView", description: "Le compte de la personne connectée" });
export type AccountView = z.infer<typeof AccountViewSchema>;

const sessionToken = z
  .string()
  .regex(SESSION_TOKEN_PATTERN)
  .describe(
    "Jeton de session : à garder dans un cookie HttpOnly côté site, jamais lisible par JavaScript",
  );

export const OpenedSessionSchema = z
  .object({
    token: sessionToken,
    expiresAt: z.iso
      .datetime()
      .describe("Fin de la session si le client ne revient pas (30 jours glissants)"),
    account: AccountViewSchema,
  })
  .meta({
    id: "OpenedSession",
    description: "Session ouverte (connexion ou inscription vérifiée)",
  });
export type OpenedSession = z.infer<typeof OpenedSessionSchema>;

export const SignupVerifiedSchema = z
  .object({
    status: z.literal("active"),
    token: sessionToken,
    expiresAt: z.iso.datetime(),
    account: AccountViewSchema,
  })
  .meta({
    id: "SignupVerified",
    description: "Compte créé et vérifié (BR-041), et client connecté directement",
  });
export type SignupVerified = z.infer<typeof SignupVerifiedSchema>;

export const LoginRequestSchema = z
  .strictObject({
    identifier: z.string().max(300).describe("Adresse e-mail ou mobile gabonais"),
    password: z.string().max(200),
  })
  .meta({ id: "LoginRequest" });
export type LoginRequest = z.infer<typeof LoginRequestSchema>;

export const CurrentSessionSchema = z
  .object({ expiresAt: z.iso.datetime(), account: AccountViewSchema })
  .meta({ id: "CurrentSession", description: "La session présentée est valable (et prolongée)" });
export type CurrentSession = z.infer<typeof CurrentSessionSchema>;

export const LogoutAllSchema = z
  .object({ revoked: z.int().nonnegative().describe("Nombre de sessions fermées") })
  .meta({ id: "LogoutAll" });
export type LogoutAll = z.infer<typeof LogoutAllSchema>;

export const SignupResendRequestSchema = z
  .strictObject({ ticket })
  .meta({ id: "SignupResendRequest" });
export type SignupResendRequest = z.infer<typeof SignupResendRequestSchema>;

// --- Identité : mot de passe oublié (S4-T04) ---

export const ForgotPasswordRequestSchema = z
  .strictObject({ identifier: z.string().max(300).describe("Adresse e-mail ou mobile gabonais") })
  .meta({ id: "ForgotPasswordRequest" });
export type ForgotPasswordRequest = z.infer<typeof ForgotPasswordRequestSchema>;

export const ResetStartedSchema = z
  .object({
    ticket: z
      .string()
      .regex(SIGNUP_TICKET_PATTERN)
      .describe("Ticket de réinitialisation, à garder côté serveur du site (cookie HttpOnly)"),
    channel: z.enum(OTP_CHANNELS),
    sentTo: z.string().describe("Destination masquée"),
    resendInSeconds: z.int().positive(),
  })
  .meta({
    id: "ResetStarted",
    description:
      "Réponse IDENTIQUE qu'un compte existe ou non (« si un compte existe, un code a été envoyé ») ; sans compte, rien n'est envoyé.",
  });
export type ResetStarted = z.infer<typeof ResetStartedSchema>;

export const ResetResendRequestSchema = z
  .strictObject({ ticket: z.string().regex(SIGNUP_TICKET_PATTERN) })
  .meta({ id: "ResetResendRequest" });
export type ResetResendRequest = z.infer<typeof ResetResendRequestSchema>;

export const ResetPasswordRequestSchema = z
  .strictObject({
    ticket: z.string().regex(SIGNUP_TICKET_PATTERN),
    code: z.string().regex(OTP_CODE_PATTERN).describe("Code à 6 chiffres reçu par e-mail"),
    newPassword: z.string().max(200).describe("8 à 128 caractères, une lettre et un chiffre"),
  })
  .meta({ id: "ResetPasswordRequest" });
export type ResetPasswordRequest = z.infer<typeof ResetPasswordRequestSchema>;

// --- Administration : rôles et journal d'audit (S4-T06, ADR-0020) ---

export const AdminAccountLookupRequestSchema = z
  .strictObject({ identifier: z.string().max(300).describe("Adresse e-mail ou mobile gabonais") })
  .meta({
    id: "AdminAccountLookupRequest",
    description:
      "Recherche d'un compte (dans le corps : jamais d'adresse e-mail dans l'URL ni les journaux)",
  });
export type AdminAccountLookupRequest = z.infer<typeof AdminAccountLookupRequestSchema>;

export const AdminAccountSchema = AccountViewSchema.extend({
  status: z.enum(["pending", "active", "disabled"]),
  createdAt: z.iso.datetime(),
}).meta({ id: "AdminAccount", description: "Un compte vu par l'administration" });
export type AdminAccount = z.infer<typeof AdminAccountSchema>;

/**
 * UUID reçu dans une adresse, ramené en minuscules : PostgreSQL ignore la casse des UUID, le code non.
 * Sans cela, « mon UUID en majuscules » passerait la règle « pas sur soi-même » (relecture S4-T06).
 */
const uuidInput = uuid.transform((value) => value.toLowerCase());

/** Paramètres de chemin de `PUT|DELETE /admin/accounts/{accountId}/roles/{role}`. */
export const AdminRoleParamsSchema = z.strictObject({
  accountId: uuidInput,
  role: z.enum(ADMIN_ASSIGNABLE_ROLES),
});
export type AdminRoleParams = z.infer<typeof AdminRoleParamsSchema>;

/** Position dans le journal (page suivante) : opaque pour le client. */
export const AUDIT_CURSOR_PATTERN = /^[A-Za-z0-9_-]{20,120}$/;

export const AuditQueryParamsSchema = z.strictObject({
  limit: z.coerce.number().int().min(1).max(AUDIT_PAGE_MAX).default(AUDIT_PAGE_DEFAULT),
  before: z.string().regex(AUDIT_CURSOR_PATTERN).optional(),
  action: z.enum(AUDIT_ACTIONS).optional(),
  accountId: uuid.optional().describe("Lignes où ce compte agit ou est la cible"),
});
export type AuditQueryParams = z.infer<typeof AuditQueryParamsSchema>;

export const AuditEventSchema = z
  .object({
    id: uuid,
    occurredAt: z.iso.datetime(),
    action: z.enum(AUDIT_ACTIONS),
    actor: z.discriminatedUnion("type", [
      z.object({ type: z.literal("account"), id: uuid }),
      z.object({ type: z.literal("system") }),
    ]),
    target: z
      .object({ type: z.enum(["account", "coupon", "order", "refund", "shop"]), id: uuid })
      .nullable(),
    details: z.record(z.string(), z.union([z.string(), z.int()])),
    ip: z.string().nullable().describe("Adresse vue par l'API"),
    requestId: z
      .string()
      .nullable()
      .describe("Identifiant de la requête dans les journaux techniques"),
  })
  .meta({
    id: "AuditEvent",
    description: "Une action sensible : qui, quoi, sur quoi, quand, d'où",
  });
export type AuditEvent = z.infer<typeof AuditEventSchema>;

export const AuditPageSchema = z
  .object({
    items: z.array(AuditEventSchema),
    nextCursor: z
      .string()
      .regex(AUDIT_CURSOR_PATTERN)
      .nullable()
      .describe("À passer dans `before` pour la page suivante ; vide à la fin"),
  })
  .meta({ id: "AuditPage", description: "Journal d'audit, du plus récent au plus ancien" });
export type AuditPage = z.infer<typeof AuditPageSchema>;

// --- Panier serveur (S5-T01, ADR-0023) ---

const cartQuantity = z
  .int()
  .min(1)
  .max(CART_MAX_QUANTITY)
  .describe(`Quantité, de 1 à ${CART_MAX_QUANTITY}`);

export const CartAddRequestSchema = z
  .strictObject({ variantId: uuid, quantity: cartQuantity })
  .meta({
    id: "CartAddRequest",
    description:
      "Ajoute une variante au panier ; si elle y est déjà, les quantités s'additionnent (limitées au stock et au maximum par ligne)",
  });
export type CartAddRequest = z.infer<typeof CartAddRequestSchema>;

export const CartQuantityRequestSchema = z.strictObject({ quantity: cartQuantity }).meta({
  id: "CartQuantityRequest",
  description: "Nouvelle quantité d'une ligne (ramenée au stock disponible si besoin)",
});
export type CartQuantityRequest = z.infer<typeof CartQuantityRequestSchema>;

export const CartItemParamsSchema = z.strictObject({ variantId: uuid });

export const CartMergeRequestSchema = z
  .strictObject({
    mergeId: uuid.describe(
      "Identifiant de CETTE réunion, tiré par le navigateur et réutilisé s'il la renvoie : une réunion déjà appliquée ne double rien",
    ),
    lines: z
      .array(z.strictObject({ variantId: uuid, quantity: cartQuantity }))
      .max(CART_MAX_LINES)
      .describe("Panier du navigateur : variantes et quantités seulement, jamais de prix (BR-004)"),
  })
  .meta({
    id: "CartMergeRequest",
    description:
      "Panier du navigateur à réunir avec le panier du compte, juste après la connexion (quantités additionnées)",
  });
export type CartMergeRequest = z.infer<typeof CartMergeRequestSchema>;

export const CartLineSchema = z
  .object({
    variantId: uuid,
    productId: uuid,
    slug,
    title: z.string(),
    variantName: z.string().describe("Nom de la variante (« Noir · 128 Go »)"),
    image: z.string().nullable(),
    price: fcfa.describe("Prix unitaire ACTUEL, relu dans le catalogue (BR-004)"),
    compareAtPrice: fcfa.nullable(),
    quantity: cartQuantity,
    maxQuantity: z
      .int()
      .nonnegative()
      .max(CART_MAX_QUANTITY)
      .describe(
        "Quantité qu'on peut demander maintenant (stock disponible, limité au maximum par ligne)",
      ),
    ok: z.boolean().describe("Commandable maintenant, à cette quantité (BR-001)"),
    reason: z.enum(AVAILABILITY_REASONS).optional(),
    available: z.int().nonnegative().optional().describe("Quantité restante (STOCK_INSUFFISANT)"),
  })
  .meta({
    id: "CartLine",
    description: "Ligne du panier, avec les informations actuelles du catalogue",
  });
export type CartLine = z.infer<typeof CartLineSchema>;

export const CartSchema = z
  .object({
    lines: z.array(CartLineSchema).max(CART_MAX_LINES),
    itemCount: z.int().nonnegative().describe("Nombre d'articles (somme des quantités)"),
    subtotal: z
      .int()
      .nonnegative()
      .describe("Total des lignes commandables, en FCFA (sans livraison ni réduction)"),
    ok: z
      .boolean()
      .describe("Panier non vide et toutes les lignes commandables : on peut passer en caisse"),
  })
  .meta({
    id: "Cart",
    description: "Panier du compte connecté, vérifié à chaque lecture (BR-001, BR-004)",
  });
export type Cart = z.infer<typeof CartSchema>;

export const CartMergedSchema = CartSchema.extend({
  ignored: z
    .int()
    .nonnegative()
    .describe("Lignes du navigateur non reprises (produit indisponible ou panier plein)"),
}).meta({ id: "CartMerged", description: "Panier après la réunion avec celui du navigateur" });
export type CartMerged = z.infer<typeof CartMergedSchema>;

// --- Commandes (S5-T02, ADR-0024) ---

const orderReference = z
  .string()
  .regex(ORDER_REFERENCE_PATTERN)
  .describe(
    "Numéro de commande montré au client (« KMD-7F3K9Q »), jamais des numéros qui se suivent",
  );
const paymentMethod = z.enum(PAYMENT_METHODS).describe("airtel, moov ou cod (à la livraison)");
const couponCode = z
  .string()
  .regex(COUPON_CODE_PATTERN)
  .describe("Code coupon (4 à 20 lettres, chiffres ou tirets ; majuscules ou minuscules)");

export const DeliveryAddressSchema = z
  .strictObject({
    fullName: z.string().max(120).describe("Prénom et nom de la personne qui reçoit"),
    phone: z.string().max(30).describe("Mobile gabonais (06… / 07…) joignable par le livreur"),
    cityId: z.string().max(40).describe("Ville (liste du contrat : `@kemdia/contracts/delivery`)"),
    neighborhood: z
      .string()
      .max(80)
      .describe("Quartier de la liste de la ville, ou « Autre quartier »"),
    landmark: z.string().max(400).describe("Point de repère pour le livreur (5 à 200 caractères)"),
  })
  .meta({ id: "DeliveryAddress", description: "Adresse de livraison, copiée dans la commande" });
export type DeliveryAddress = z.infer<typeof DeliveryAddressSchema>;

export const OrderQuoteRequestSchema = z
  .strictObject({ cityId: z.string().max(40), couponCode: couponCode.optional() })
  .meta({
    id: "OrderQuoteRequest",
    description: "Ville de livraison envisagée (et coupon), pour calculer le total du panier",
  });
export type OrderQuoteRequest = z.infer<typeof OrderQuoteRequestSchema>;

export const OrderQuoteSchema = z
  .object({
    subtotal: z.int().nonnegative().describe("Articles commandables, en FCFA (prix du catalogue)"),
    discount: z
      .int()
      .nonnegative()
      .describe("Réduction du coupon (articles seulement, jamais la livraison)"),
    coupon: z
      .object({ code: z.string(), discount: z.int().positive() })
      .nullable()
      .describe("Coupon appliqué (refusé : erreur `COUPON_*`)"),
    deliveryFee: z.int().nonnegative(),
    total: z
      .int()
      .nonnegative()
      .describe("À renvoyer tel quel dans `expectedTotal` pour commander"),
    freeDeliveryThreshold: z.int().nonnegative(),
    deliveryDaysMin: z.int().positive(),
    deliveryDaysMax: z.int().positive(),
    cartOk: z.boolean().describe("Panier non vide et entièrement commandable"),
    cod: z
      .object({ allowed: z.boolean(), reason: z.string().optional() })
      .describe(
        "Paiement à la livraison possible pour cette ville et ce total (BR-011), sinon la raison",
      ),
    mobileMoney: z
      .object({ allowed: z.boolean() })
      .describe(
        "Paiement Mobile Money possible sur cet environnement (un fournisseur est branché) — S5-T07",
      ),
  })
  .meta({
    id: "OrderQuote",
    description: "Total calculé par le serveur (BR-004) avant la commande",
  });
export type OrderQuote = z.infer<typeof OrderQuoteSchema>;

export const CreateOrderRequestSchema = z
  .strictObject({
    idempotencyKey: uuid.describe(
      "Tiré par le site pour CETTE commande et renvoyé tel quel en cas de nouvel essai : jamais deux commandes",
    ),
    expectedTotal: z
      .int()
      .nonnegative()
      .describe(
        "Total affiché au client ; s'il ne correspond plus, la commande est refusée (`PRIX_MODIFIE`)",
      ),
    delivery: DeliveryAddressSchema,
    couponCode: couponCode.optional().describe("Un seul coupon par commande (BR-030)"),
    payment: z.strictObject({
      method: paymentMethod,
      phone: z
        .string()
        .max(30)
        .optional()
        .describe("Numéro Mobile Money (obligatoire pour airtel / moov)"),
    }),
  })
  .meta({
    id: "CreateOrderRequest",
    description:
      "Commande du panier du compte : les articles et les prix viennent du serveur, jamais de la requête (BR-004)",
  });
export type CreateOrderRequest = z.infer<typeof CreateOrderRequestSchema>;

export const OrderLineSchema = z
  .object({
    variantId: uuid,
    productId: uuid,
    title: z.string(),
    variantName: z.string(),
    image: z.string().nullable(),
    unitPrice: fcfa.describe("Prix unitaire au moment de la commande"),
    quantity: cartQuantity,
    lineTotal: fcfa,
  })
  .meta({
    id: "OrderLine",
    description: "Article commandé (copie figée au moment de la commande)",
  });
export type OrderLine = z.infer<typeof OrderLineSchema>;

export const OrderSchema = z
  .object({
    id: uuid,
    reference: orderReference,
    status: z.enum(ORDER_STATUSES),
    paymentMethod,
    paymentPhone: z.string().nullable(),
    subtotal: fcfa,
    discount: z.int().nonnegative(),
    couponCode: z.string().nullable(),
    deliveryFee: z.int().nonnegative(),
    total: fcfa,
    delivery: z.object({
      fullName: z.string(),
      phone: z.string(),
      cityId: z.string(),
      cityName: z.string(),
      neighborhood: z.string(),
      landmark: z.string(),
      daysMin: z.int().positive(),
      daysMax: z.int().positive(),
    }),
    lines: z.array(OrderLineSchema).min(1).max(CART_MAX_LINES),
    createdAt: z.iso.datetime(),
    paymentDueAt: z.iso
      .datetime()
      .nullable()
      .describe(
        "En attente de paiement : au-delà, la commande est annulée et le stock remis en vente",
      ),
    cancelledAt: z.iso.datetime().nullable(),
    cancelReason: z.enum(CANCEL_REASONS).nullable(),
    paidAt: z.iso
      .datetime()
      .nullable()
      .describe("Paiement reçu (Mobile Money confirmé ou espèces encaissées) — S5-T04"),
    canCancel: z.boolean().describe("Le client peut encore l'annuler (avant l'expédition)"),
    history: z
      .array(z.object({ status: z.enum(ORDER_STATUSES), at: z.iso.datetime() }))
      .describe("Changements de statut, du plus ancien au plus récent"),
  })
  .meta({ id: "Order", description: "Commande du compte connecté" });
export type Order = z.infer<typeof OrderSchema>;

export const OrderSummarySchema = z
  .object({
    id: uuid,
    reference: orderReference,
    status: z.enum(ORDER_STATUSES),
    total: fcfa,
    itemCount: z.int().positive(),
    image: z.string().nullable(),
    createdAt: z.iso.datetime(),
  })
  .meta({ id: "OrderSummary", description: "Ligne de « Mes commandes »" });
export type OrderSummary = z.infer<typeof OrderSummarySchema>;

export const ORDER_CURSOR_PATTERN = /^[A-Za-z0-9_-]{20,120}$/;

export const OrderListParamsSchema = z.strictObject({
  limit: z.coerce.number().int().min(1).max(ORDER_PAGE_MAX).default(ORDER_PAGE_DEFAULT),
  before: z.string().regex(ORDER_CURSOR_PATTERN).optional(),
});
export type OrderListParams = z.infer<typeof OrderListParamsSchema>;

export const OrderPageSchema = z
  .object({
    items: z.array(OrderSummarySchema),
    nextCursor: z.string().regex(ORDER_CURSOR_PATTERN).nullable(),
  })
  .meta({
    id: "OrderPage",
    description: "Commandes du compte, de la plus récente à la plus ancienne",
  });
export type OrderPage = z.infer<typeof OrderPageSchema>;

export const OrderReferenceParamsSchema = z.strictObject({ reference: orderReference });

// --- Coupons : administration (S5-T03, ADR-0025) ---

const couponFields = {
  kind: z.enum(COUPON_KINDS).describe("percent : pourcentage ; fixed : montant en FCFA"),
  value: z
    .int()
    .positive()
    .max(COUPON_LIMITS.fixedMax)
    .describe(`Pourcentage (1 à ${COUPON_PERCENT_MAX}) ou montant en FCFA`),
  maxDiscount: fcfa
    .max(COUPON_LIMITS.maxDiscountMax)
    .nullable()
    .describe("Plafond de la réduction en FCFA (pourcentage seulement)"),
  minSubtotal: z
    .int()
    .nonnegative()
    .max(COUPON_LIMITS.minSubtotalMax)
    .nullable()
    .describe(
      "Montant minimum d'articles, en FCFA (obligatoire pour un montant fixe, et supérieur à ce montant)",
    ),
  startsAt: z.iso.datetime().nullable().describe("Valable à partir de (vide : tout de suite)"),
  endsAt: z.iso.datetime().nullable().describe("Valable jusqu'à (vide : sans fin)"),
  usageLimit: z
    .int()
    .positive()
    .max(COUPON_LIMITS.usageLimitMax)
    .nullable()
    .describe("Utilisations au total (vide : sans limite)"),
  perAccountLimit: z
    .int()
    .positive()
    .max(COUPON_LIMITS.perAccountLimitMax)
    .nullable()
    .describe("Utilisations par compte (vide : sans limite)"),
  stackableWithSales: z
    .boolean()
    .describe("S'applique aussi aux articles déjà en promotion (prix barré) — BR-031"),
};

export const CouponCreateRequestSchema = z
  .strictObject({
    code: couponCode,
    kind: couponFields.kind,
    value: couponFields.value,
    maxDiscount: couponFields.maxDiscount.optional(),
    minSubtotal: couponFields.minSubtotal.optional(),
    startsAt: couponFields.startsAt.optional(),
    endsAt: couponFields.endsAt.optional(),
    usageLimit: couponFields.usageLimit.optional(),
    perAccountLimit: couponFields.perAccountLimit
      .optional()
      .describe("Utilisations par compte (1 par défaut ; null : sans limite)"),
    stackableWithSales: couponFields.stackableWithSales
      .optional()
      .describe("Cumulable avec les prix barrés (non par défaut, BR-031)"),
  })
  .meta({ id: "CouponCreateRequest", description: "Nouveau coupon (administrateur)" });
export type CouponCreateRequest = z.infer<typeof CouponCreateRequestSchema>;

export const CouponUpdateRequestSchema = z.strictObject({ active: z.boolean() }).meta({
  id: "CouponUpdateRequest",
  description: "Activer ou désactiver un coupon (ses règles ne changent pas une fois créé)",
});
export type CouponUpdateRequest = z.infer<typeof CouponUpdateRequestSchema>;

export const CouponSchema = z
  .object({
    id: uuid,
    code: z.string(),
    ...couponFields,
    usedCount: z.int().nonnegative().describe("Utilisations comptées (commandes non annulées)"),
    active: z.boolean(),
    createdAt: z.iso.datetime(),
  })
  .meta({ id: "Coupon", description: "Coupon de réduction" });
export type Coupon = z.infer<typeof CouponSchema>;

export const COUPON_CURSOR_PATTERN = /^[A-Za-z0-9_-]{20,120}$/;

export const CouponListParamsSchema = z.strictObject({
  limit: z.coerce.number().int().min(1).max(COUPON_PAGE_MAX).default(COUPON_PAGE_DEFAULT),
  before: z.string().regex(COUPON_CURSOR_PATTERN).optional(),
});
export type CouponListParams = z.infer<typeof CouponListParamsSchema>;

export const CouponPageSchema = z
  .object({
    items: z.array(CouponSchema),
    nextCursor: z.string().regex(COUPON_CURSOR_PATTERN).nullable(),
  })
  .meta({ id: "CouponPage", description: "Coupons, du plus récent au plus ancien" });
export type CouponPage = z.infer<typeof CouponPageSchema>;

export const CouponIdParamsSchema = z.strictObject({ couponId: uuid });

// --- Paiements (S5-T04, ADR-0026) ---

export const StartPaymentRequestSchema = z
  .strictObject({
    phone: z
      .string()
      .max(30)
      .optional()
      .describe("Autre numéro du MÊME opérateur (sinon celui de la commande)"),
  })
  .meta({
    id: "StartPaymentRequest",
    description: "Demander la validation du paiement sur le téléphone (3 essais au plus)",
  });
export type StartPaymentRequest = z.infer<typeof StartPaymentRequestSchema>;

export const PaymentSchema = z
  .object({
    id: uuid,
    orderReference: z.string(),
    method: z.enum(["airtel", "moov", "cod"]),
    amount: fcfa,
    phone: z.string().nullable(),
    status: z.enum(PAYMENT_STATUSES),
    attempt: z.int().positive(),
    attemptsLeft: z.int().nonnegative(),
    failureReason: z.string().nullable(),
    createdAt: z.iso.datetime(),
    completedAt: z.iso.datetime().nullable(),
  })
  .meta({ id: "Payment", description: "Tentative de paiement d'une commande" });
export type Payment = z.infer<typeof PaymentSchema>;

export const AdminCancelOrderRequestSchema = z
  .strictObject({
    note: z
      .string()
      .trim()
      .min(3)
      .max(100)
      .describe("Raison (service client), inscrite au journal d'audit"),
  })
  .meta({ id: "AdminCancelOrderRequest" });
export type AdminCancelOrderRequest = z.infer<typeof AdminCancelOrderRequestSchema>;

export const RefundSchema = z
  .object({
    id: uuid,
    orderReference: z.string(),
    amount: fcfa,
    method: z.enum(["airtel", "moov"]),
    phone: z.string(),
    reason: z.enum(REFUND_REASONS),
    status: z.enum(REFUND_STATUSES),
    externalReference: z
      .string()
      .nullable()
      .describe("Référence du remboursement chez l'opérateur"),
    createdAt: z.iso.datetime(),
    doneAt: z.iso.datetime().nullable(),
  })
  .meta({ id: "Refund", description: "Remboursement à faire ou fait (suivi manuel)" });
export type Refund = z.infer<typeof RefundSchema>;

export const RefundListParamsSchema = z.strictObject({
  status: z.enum(REFUND_STATUSES).default("to_do"),
});
export const RefundPageSchema = z.object({ items: z.array(RefundSchema).max(200) }).meta({
  id: "RefundPage",
  description: "Remboursements (200 au plus, les plus anciens d'abord)",
});
export type RefundPage = z.infer<typeof RefundPageSchema>;

export const RefundDoneRequestSchema = z
  .strictObject({
    externalReference: z
      .string()
      .min(3)
      .max(100)
      .regex(/^[A-Za-z0-9._/-]+$/)
      .describe("Référence de l'opération chez l'opérateur"),
  })
  .meta({ id: "RefundDoneRequest" });
export type RefundDoneRequest = z.infer<typeof RefundDoneRequestSchema>;

export const CodCollectedRequestSchema = z
  .strictObject({ amount: fcfa.describe("Montant encaissé (doit être le total de la commande)") })
  .meta({ id: "CodCollectedRequest" });
export type CodCollectedRequest = z.infer<typeof CodCollectedRequestSchema>;

export const CodSettingsSchema = z
  .object({
    zones: z
      .array(z.enum(["zone_1", "zone_2", "zone_3", "zone_4"]))
      .max(4)
      .describe("Zones où le paiement à la livraison est proposé (vide : nulle part)"),
    maxTotal: z.int().nonnegative().max(10_000_000).describe("Total maximum, livraison comprise"),
    updatedAt: z.iso.datetime().nullable(),
  })
  .meta({ id: "CodSettings", description: "Réglage du paiement à la livraison (BR-011)" });
export type CodSettings = z.infer<typeof CodSettingsSchema>;

export const CodSettingsRequestSchema = z
  .strictObject({
    zones: CodSettingsSchema.shape.zones,
    maxTotal: CodSettingsSchema.shape.maxTotal,
  })
  .meta({ id: "CodSettingsRequest" });
export type CodSettingsRequest = z.infer<typeof CodSettingsRequestSchema>;

export const RefundIdParamsSchema = z.strictObject({ refundId: uuid });

// --- Notifications de l'opérateur et bac à sable (S5-T05, ADR-0027) ---

export const PaymentNotificationSchema = z
  .strictObject({
    eventId: uuid.describe(
      "Identifiant unique de la notification : une notification déjà reçue est ignorée",
    ),
    type: z.enum(PAYMENT_NOTIFICATION_TYPES),
    paymentId: uuid.describe("Identifiant de l'essai, envoyé par Kemdia avec la demande"),
    providerRef: z
      .string()
      .regex(/^[A-Za-z0-9._:-]{1,100}$/)
      .describe("Référence de l'opération chez l'opérateur"),
    amount: fcfa.optional().describe("Montant reçu (obligatoire pour « payment.succeeded »)"),
    currency: z.literal("XAF"),
    failureReason: z.string().max(60).optional().describe("Raison de l'échec (« payment.failed »)"),
    occurredAt: z.iso.datetime(),
  })
  .meta({
    id: "PaymentNotification",
    description: `Notification de l'opérateur, signée (en-tête ${PAYMENT_SIGNATURE_HEADER})`,
  });
export type PaymentNotification = z.infer<typeof PaymentNotificationSchema>;

export const PaymentNotificationAckSchema = z
  .object({
    received: z.literal(true),
    duplicate: z.boolean().describe("Notification déjà reçue : rien n'a changé"),
  })
  .meta({ id: "PaymentNotificationAck" });
export type PaymentNotificationAck = z.infer<typeof PaymentNotificationAckSchema>;

export const SandboxPaymentRequestSchema = z
  .object({
    paymentId: uuid,
    orderReference: z.string(),
    method: z.enum(["airtel", "moov"]),
    amount: fcfa,
    phone: z.string(),
    createdAt: z.iso.datetime(),
  })
  .meta({
    id: "SandboxPaymentRequest",
    description: "Demande de paiement reçue par le téléphone simulé (bac à sable)",
  });
export type SandboxPaymentRequest = z.infer<typeof SandboxPaymentRequestSchema>;

export const SandboxPaymentRequestPageSchema = z
  .object({ items: z.array(SandboxPaymentRequestSchema).max(20) })
  .meta({ id: "SandboxPaymentRequestPage" });
export type SandboxPaymentRequestPage = z.infer<typeof SandboxPaymentRequestPageSchema>;

export const SandboxDecisionRequestSchema = z
  .strictObject({
    decision: z.enum(["approve", "decline"]),
    pin: z
      .string()
      .regex(SANDBOX_PIN_PATTERN)
      .optional()
      .describe("Code PIN fictif (4 chiffres), pour valider"),
  })
  .meta({ id: "SandboxDecisionRequest" });
export type SandboxDecisionRequest = z.infer<typeof SandboxDecisionRequestSchema>;

export const SandboxDecisionSchema = z
  .object({
    status: z.enum(["succeeded", "failed"]),
    failureReason: z.string().nullable(),
  })
  .meta({ id: "SandboxDecision", description: "Ce que l'opérateur simulé a répondu" });
export type SandboxDecision = z.infer<typeof SandboxDecisionSchema>;

export const SandboxPaymentParamsSchema = z.strictObject({ paymentId: uuid });

// --- Factures (S5-T06, ADR-0028) ---

export const InvoiceSummarySchema = z
  .object({
    number: z.string().regex(INVOICE_NUMBER_PATTERN),
    kind: z.enum(INVOICE_KINDS),
    orderReference: z.string(),
    issuedAt: z.iso.datetime(),
    total: fcfa,
  })
  .meta({
    id: "InvoiceSummary",
    description: "Facture ou avoir d'une commande (PDF téléchargeable)",
  });
export type InvoiceSummary = z.infer<typeof InvoiceSummarySchema>;

export const InvoiceListSchema = z.object({ items: z.array(InvoiceSummarySchema).max(2) }).meta({
  id: "InvoiceList",
  description: "Facture de la commande, et son avoir si elle a été annulée",
});
export type InvoiceList = z.infer<typeof InvoiceListSchema>;

export const InvoiceParamsSchema = z.strictObject({
  reference: orderReference,
  number: z.string().regex(INVOICE_NUMBER_PATTERN),
});

const billingText = (max: number) => z.string().trim().min(1).max(max);

export const BillingSettingsRequestSchema = z
  .strictObject({
    legalName: billingText(120).describe("Raison sociale"),
    address: billingText(200),
    city: billingText(60),
    phone: billingText(30),
    email: z.email().max(120),
    taxId: billingText(40).describe("NIF"),
    tradeRegister: billingText(40).describe("RCCM"),
    vatMention: billingText(120).describe("Mention de TVA imprimée sur les factures"),
  })
  .meta({
    id: "BillingSettingsRequest",
    description: "Informations de l'entreprise imprimées sur les factures",
  });
export type BillingSettingsRequest = z.infer<typeof BillingSettingsRequestSchema>;

export const BillingSettingsSchema = BillingSettingsRequestSchema.extend({
  updatedAt: z.iso.datetime().nullable(),
}).meta({
  id: "BillingSettings",
  description: "Informations de l'entreprise (copiées et figées dans chaque facture)",
});
export type BillingSettings = z.infer<typeof BillingSettingsSchema>;

// --- Boutiques des vendeurs (S6-T01, ADR-0032) ---

/**
 * Texte saisi : la longueur exacte (espaces retirés) est vérifiée par l'API (`BOUTIQUE_INVALIDE`, 422) ; ici, seulement
 * une borne large pour refuser tôt un corps démesuré.
 */
const shopText = (max: number) => z.string().max(max * 2);

export const ShopApplicationRequestSchema = z
  .strictObject({
    name: shopText(SHOP_LIMITS.nameMax).describe(
      `Nom de la boutique (${SHOP_LIMITS.nameMin} à ${SHOP_LIMITS.nameMax} caractères, unique, sans « Kemdia »)`,
    ),
    city: shopText(SHOP_LIMITS.cityMax).describe("Ville où se trouve la boutique"),
    phone: z.string().max(30).describe("Mobile gabonais de contact (06… ou 07…)"),
    description: shopText(SHOP_LIMITS.descriptionMax).describe(
      `Ce que vend la boutique (${SHOP_LIMITS.descriptionMin} à ${SHOP_LIMITS.descriptionMax} caractères)`,
    ),
  })
  .meta({
    id: "ShopApplicationRequest",
    description:
      "Demande d'ouverture de boutique (compte connecté) : examinée par un administrateur avant toute vente",
  });
export type ShopApplicationRequest = z.infer<typeof ShopApplicationRequestSchema>;

const shopFields = {
  id: uuid,
  kind: z.enum(SHOP_KINDS).describe("kemdia : boutique de Kemdia ; partner : vendeur tiers"),
  name: z.string(),
  slug,
  city: z.string(),
  description: z.string(),
  status: z.enum(SHOP_STATUSES),
  statusReason: z
    .string()
    .nullable()
    .describe("Motif du refus ou de la suspension, montré au vendeur"),
  submittedAt: z.iso.datetime().describe("Dernière demande envoyée"),
  reviewedAt: z.iso.datetime().nullable().describe("Dernière décision de l'administration"),
};

export const ShopSchema = z
  .object({ ...shopFields, phone: z.string().nullable().describe("Mobile de contact") })
  .meta({ id: "Shop", description: "La boutique du compte connecté" });
export type Shop = z.infer<typeof ShopSchema>;

export const AdminShopSchema = z
  .object({
    ...shopFields,
    phone: z.string().nullable(),
    ownerAccountId: uuid.nullable().describe("Compte du vendeur (vide : boutique Kemdia)"),
    reviewedBy: uuid.nullable().describe("Administrateur de la dernière décision"),
    createdAt: z.iso.datetime(),
  })
  .meta({ id: "AdminShop", description: "Une boutique vue par l'administration" });
export type AdminShop = z.infer<typeof AdminShopSchema>;

export const SHOP_CURSOR_PATTERN = /^[A-Za-z0-9_-]{20,120}$/;

export const ShopListParamsSchema = z.strictObject({
  status: z.enum(SHOP_STATUSES).optional(),
  limit: z.coerce.number().int().min(1).max(SHOP_PAGE_MAX).default(SHOP_PAGE_DEFAULT),
  after: z
    .string()
    .regex(SHOP_CURSOR_PATTERN)
    .optional()
    .describe("`nextCursor` de la page précédente"),
});
export type ShopListParams = z.infer<typeof ShopListParamsSchema>;

export const AdminShopPageSchema = z
  .object({
    items: z.array(AdminShopSchema),
    nextCursor: z.string().regex(SHOP_CURSOR_PATTERN).nullable(),
  })
  .meta({
    id: "AdminShopPage",
    description: "Boutiques, de la demande la plus ancienne à la plus récente (file d'attente)",
  });
export type AdminShopPage = z.infer<typeof AdminShopPageSchema>;

export const ShopIdParamsSchema = z.strictObject({ shopId: uuidInput });

export const ShopDecisionReasonSchema = z
  .strictObject({
    reason: z
      .string()
      .max(SHOP_LIMITS.reasonMax * 2)
      .describe(
        `Motif montré au vendeur (${SHOP_LIMITS.reasonMin} à ${SHOP_LIMITS.reasonMax} caractères)`,
      ),
  })
  .meta({ id: "ShopDecisionReason", description: "Motif d'un refus ou d'une suspension" });
export type ShopDecisionReason = z.infer<typeof ShopDecisionReasonSchema>;

type JsonSchema = Record<string, unknown>;

/**
 * Tous les schémas ci-dessus au format JSON Schema 2020-12, prêts pour `components.schemas` d'un document OpenAPI 3.1.
 * Calculé avec la même instance de Zod que celle qui a enregistré les schémas.
 */
export function openApiComponentSchemas(): Record<string, JsonSchema> {
  const { schemas } = z.toJSONSchema(z.globalRegistry, {
    uri: (id) => `#/components/schemas/${id}`,
  }) as { schemas: Record<string, JsonSchema> };
  return Object.fromEntries(
    Object.entries(schemas)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([id, schema]) => {
        const rest = { ...schema };
        // $schema et $id sont propres à un fichier JSON Schema isolé : inutiles dans un composant OpenAPI
        delete rest.$schema;
        delete rest.$id;
        return [id, rest];
      }),
  );
}
