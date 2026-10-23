import { z } from "zod";
import {
  API_ERROR_CODES,
  AVATAR_VERSION_PATTERN,
  LISTING_CORRECTION_LIMITS,
  PRIVACY_ERROR_CODES,
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
  STAFF_ROLES,
  STAFF_LIMITS,
  DEVICE_ID_PATTERN,
  DEVICE_ALERT_TOKEN_PATTERN,
  MAX_AVAILABILITY_LINES,
  MAX_ORDER_QUANTITY,
  OTP_CHANNELS,
  OTP_CODE_PATTERN,
  SESSION_TOKEN_PATTERN,
  SIGNUP_TICKET_PATTERN,
  SLUG_PATTERN,
  SHOP_KINDS,
  SHOP_LIMITS,
  SHIPMENT_STATUSES,
  SHIPPING_LIMITS,
  SHOP_PAGE_DEFAULT,
  SHOP_PAGE_MAX,
  SHOP_STATUSES,
  RECOVERY_CODE_COUNT,
  RECOVERY_CODE_PATTERN,
  VENDOR_PRODUCT_LIMITS,
  PRODUCT_IMAGE_LIMITS,
  VENDOR_PRODUCT_PAGE_DEFAULT,
  VENDOR_PRODUCT_PAGE_MAX,
  VENDOR_PRODUCT_STATUSES,
  VENDOR_ORDER_PAGE_DEFAULT,
  VENDOR_ORDER_PAGE_MAX,
  VENDOR_ORDER_REFUSAL_LIMITS,
  KYC_DOCUMENT_KINDS,
  KYC_HOLDER_KINDS,
  KYC_ID_TYPES,
  KYC_LIMITS,
  KYC_PAYOUT_METHODS,
  KYC_STATUSES,
  VENDOR_ORDER_STATUSES,
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
    price: fcfa.describe("Prix de l'offre mise en avant (en stock d'abord, puis la moins chère)"),
    compareAtPrice: fcfa.nullable().describe("Prix barré, toujours supérieur au prix"),
    inStock: z.boolean().describe("L'offre mise en avant a du stock"),
    variantId: uuid.describe(
      "Variante de l'offre mise en avant : celle ajoutée au panier depuis une liste",
    ),
    stock: z.int().nonnegative().describe("Stock de la variante proposée"),
    variantCount: z
      .int()
      .min(1)
      .describe("Nombre de déclinaisons proposées (au-delà de 1 : choix sur la fiche)"),
    offerCount: z
      .int()
      .min(1)
      .describe(
        "Nombre de boutiques qui vendent ce produit (S7.5-T02 : une carte par fiche commune)",
      ),
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
    correctedQuery: z
      .string()
      .max(100)
      .optional()
      .describe(
        "S7.5-T06 : aucune fiche ne contenait les mots tapés ; résultats pour ces mots corrigés (« iphone » pour « ipohne »). Absent sinon, ou avec exact=1",
      ),
  })
  .meta({ id: "ProductPage" });
export type ProductPage = z.infer<typeof ProductPageSchema>;

/** Suggestions pendant la frappe (S7.5-T06) : 4 produits, 2 rayons et 2 marques au plus. */
export const SearchSuggestionsSchema = z
  .object({
    correctedQuery: z
      .string()
      .max(100)
      .optional()
      .describe("Mots corrigés quand les mots tapés ne trouvaient rien"),
    products: z
      .array(
        z.object({
          slug: z.string(),
          title: z.string(),
          image: z.string().nullable(),
          price: fcfa.describe("Prix de l'offre mise en avant"),
        }),
      )
      .max(4),
    categories: z.array(z.object({ slug: z.string(), name: z.string() })).max(2),
    brands: z.array(z.string()).max(2),
  })
  .meta({
    id: "SearchSuggestions",
    description: "Suggestions pendant la frappe : produits, rayons et marques",
  });
export type SearchSuggestions = z.infer<typeof SearchSuggestionsSchema>;

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

export const SellerSchema = z
  .object({
    name: z.string(),
    slug,
    city: z.string(),
  })
  .meta({ id: "Seller", description: "Boutique qui vend une offre (S7.5-T02)" });
export type Seller = z.infer<typeof SellerSchema>;

export const OfferSchema = z
  .object({
    offerId: uuid,
    seller: SellerSchema.nullable().describe(
      "Boutique ; null si elle n'est pas encore connue du catalogue",
    ),
    isMain: z.boolean().describe("Offre mise en avant (bouton « Ajouter au panier »)"),
    variants: z
      .array(
        z.object({
          variantId: uuid.describe("Variante à ajouter au panier pour acheter chez cette boutique"),
          listingVariantId: uuid.describe("Déclinaison de la fiche"),
          name: z.string(),
          price: fcfa,
          compareAtPrice: fcfa.nullable(),
          stock: z.int().nonnegative(),
          available: z.boolean(),
        }),
      )
      .min(1),
  })
  .meta({ id: "Offer", description: "Offre d'une boutique sur une fiche commune (S7.5-T02)" });
export type Offer = z.infer<typeof OfferSchema>;

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
    variants: z
      .array(VariantSchema)
      .min(1)
      .describe("Une variante par déclinaison proposée : celle de l'offre mise en avant"),
    offerCount: z.int().min(1).describe("Nombre de boutiques qui vendent ce produit"),
    offers: z
      .array(OfferSchema)
      .min(1)
      .describe("Offres visibles, l'offre mise en avant d'abord (S7.5-T02)"),
  })
  .meta({ id: "ProductDetail", description: "Fiche produit commune et ses offres" });
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
    password: z.string().max(200).describe("8 à 128 caractères, pas un mot de passe courant"),
    acceptTerms: z.literal(true).describe("Acceptation des conditions générales"),
    adult: z
      .literal(true)
      .describe(
        "« J'ai 18 ans ou plus » (S7-T08, loi 001/2011 modifiée art. 74), case distincte des conditions",
      ),
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
  .strictObject({
    ticket,
    code: z.string().regex(OTP_CODE_PATTERN).describe("Code à 6 chiffres"),
    device: z
      .string()
      .regex(DEVICE_ID_PATTERN)
      .optional()
      .describe(
        "Identifiant aléatoire de l'appareil (cookie du site) : retenu sans avis (S7.5-T04)",
      ),
  })
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
      .describe(
        "Rôles cumulables (S4-T06) : toujours « client », puis vendor, catalog, logistics, finance, support, admin",
      ),
    avatar: z
      .string()
      .regex(AVATAR_VERSION_PATTERN)
      .nullable()
      .describe(
        "S7.5-T08 : version de la photo de profil (change à chaque nouvelle photo) ; null : pas de photo, initiales",
      ),
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
    device: z
      .string()
      .regex(DEVICE_ID_PATTERN)
      .optional()
      .describe(
        "Identifiant aléatoire de l'appareil (cookie du site) : avis au titulaire s'il est inconnu",
      ),
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
    newPassword: z.string().max(200).describe("8 à 128 caractères, pas un mot de passe courant"),
  })
  .meta({ id: "ResetPasswordRequest" });
export type ResetPasswordRequest = z.infer<typeof ResetPasswordRequestSchema>;

// --- Identité : changer son mot de passe depuis « Mon compte » (S7-T07, ASVS 5.0 V6.2.2 et V6.2.3) ---

export const ChangePasswordRequestSchema = z
  .strictObject({
    currentPassword: z.string().max(200).describe("Mot de passe actuel"),
    newPassword: z.string().max(200).describe("8 à 128 caractères, pas un mot de passe courant"),
  })
  .meta({ id: "ChangePasswordRequest" });
export type ChangePasswordRequest = z.infer<typeof ChangePasswordRequestSchema>;

// --- Données personnelles (S7-T08, ADR-0047) ---

export const AccountDeletionStatusSchema = z
  .strictObject({
    possible: z.boolean().describe("Vrai si le compte peut être supprimé maintenant"),
    reasons: z
      .array(z.enum(PRIVACY_ERROR_CODES))
      .describe("Ce qui empêche la suppression (vide si elle est possible)"),
  })
  .meta({ id: "AccountDeletionStatus" });
export type AccountDeletionStatus = z.infer<typeof AccountDeletionStatusSchema>;

export const DeleteAccountRequestSchema = z
  .strictObject({
    password: z.string().max(200).describe("Mot de passe actuel"),
    confirm: z.literal(true).describe("Case « Je comprends que la suppression est définitive »"),
  })
  .meta({ id: "DeleteAccountRequest" });
export type DeleteAccountRequest = z.infer<typeof DeleteAccountRequestSchema>;

export const AccountDataExportSchema = z
  .looseObject({
    format: z.literal("kemdia-donnees-personnelles/1"),
    generatedAt: z.iso.datetime().describe("Date de la copie"),
    identite: z.record(z.string(), z.unknown()),
    commandes: z.record(z.string(), z.unknown()),
    paiements: z.record(z.string(), z.unknown()),
    livraisons: z.record(z.string(), z.unknown()),
    boutique: z.record(z.string(), z.unknown()),
    journal: z
      .record(z.string(), z.unknown())
      .describe("Actions du compte et celles qui le visent (journal d'audit, 365 jours)"),
  })
  .meta({
    id: "AccountDataExport",
    description:
      "Copie des données personnelles du compte (droit d'accès et portabilité) : jamais de mot de passe, jeton, code ni photo de pièce d'identité",
  });
export type AccountDataExport = z.infer<typeof AccountDataExportSchema>;

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

// --- Équipe, service client et appareils (S7.5-T04, ADR-0051) ---

export const StaffMemberSchema = AdminAccountSchema.extend({
  secondFactorEnabled: z.boolean().describe("Double authentification activée"),
  lastActiveAt: z.iso.datetime().describe("Dernière connexion ou visite"),
}).meta({ id: "StaffMember", description: "Membre de l'équipe Kemdia (écran Utilisateurs)" });
export type StaffMember = z.infer<typeof StaffMemberSchema>;

export const STAFF_CURSOR_PATTERN = /^[A-Za-z0-9_-]{20,700}$/;

export const StaffListParamsSchema = z.strictObject({
  role: z.enum(STAFF_ROLES).optional(),
  limit: z.coerce.number().int().min(1).max(STAFF_LIMITS.pageMax).default(STAFF_LIMITS.pageDefault),
  after: z.string().regex(STAFF_CURSOR_PATTERN).optional(),
});
export type StaffListParams = z.infer<typeof StaffListParamsSchema>;

export const StaffPageSchema = z
  .object({
    items: z.array(StaffMemberSchema),
    nextCursor: z.string().regex(STAFF_CURSOR_PATTERN).nullable(),
  })
  .meta({ id: "StaffPage", description: "Comptes qui ont au moins un rôle de l'équipe, par nom" });
export type StaffPage = z.infer<typeof StaffPageSchema>;

export const AccountIdParamsSchema = z.strictObject({ accountId: uuidInput });

export const AccountDisableRequestSchema = z
  .strictObject({
    reason: z
      .string()
      .max(STAFF_LIMITS.reasonMax * 2)
      .describe(
        `Motif gardé au journal d'audit (${STAFF_LIMITS.reasonMin} à ${STAFF_LIMITS.reasonMax} caractères)`,
      ),
  })
  .meta({
    id: "AccountDisableRequest",
    description: "Désactivation d'un compte par l'administration",
  });
export type AccountDisableRequest = z.infer<typeof AccountDisableRequestSchema>;

export const StaffActionResultSchema = z
  .object({
    account: AdminAccountSchema,
    sessionsClosed: z.int().nonnegative().describe("Sessions fermées tout de suite"),
  })
  .meta({ id: "StaffActionResult", description: "Compte après l'action, et sessions fermées" });
export type StaffActionResult = z.infer<typeof StaffActionResultSchema>;

export const SupportAccountSchema = AdminAccountSchema.extend({
  lastActiveAt: z.iso.datetime(),
  emailVerified: z.boolean(),
  phoneVerified: z.boolean(),
}).meta({
  id: "SupportAccount",
  description: "Un compte vu par le service client (lecture seule)",
});
export type SupportAccount = z.infer<typeof SupportAccountSchema>;

export const DeviceNotMeRequestSchema = z
  .strictObject({ token: z.string().regex(DEVICE_ALERT_TOKEN_PATTERN) })
  .meta({
    id: "DeviceNotMeRequest",
    description: "Jeton du lien « ce n'est pas moi » reçu dans l'avis de nouvel appareil",
  });
export type DeviceNotMeRequest = z.infer<typeof DeviceNotMeRequestSchema>;

export const DeviceNotMeResultSchema = z.object({ sessionsClosed: z.int().nonnegative() }).meta({
  id: "DeviceNotMeResult",
  description: "Toutes les sessions du compte sont fermées ; changer le mot de passe ensuite",
});
export type DeviceNotMeResult = z.infer<typeof DeviceNotMeResultSchema>;

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
      .object({
        type: z.enum(["account", "coupon", "order", "refund", "shop", "product", "listing"]),
        id: uuid,
      })
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

/** Commande d'un client vue par le service client (S7.5-T04). */
export const SupportOrderParamsSchema = z.strictObject({
  accountId: uuidInput,
  reference: orderReference,
});

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

// --- Finance : factures, espèces à encaisser (S7.5-T05, ADR-0052) ---

export const ADMIN_INVOICE_CURSOR_PATTERN = /^[A-Za-z0-9_-]{20,120}$/;

export const AdminInvoiceListParamsSchema = z.strictObject({
  q: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^(KMD-[FA]-\d{4}-\d{6}|KMD-[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{6})$/)
    .optional()
    .describe(
      "Numéro de facture ou d'avoir (KMD-F-2026-000001), ou numéro de commande (KMD-7F3K9Q)",
    ),
  after: z.string().regex(ADMIN_INVOICE_CURSOR_PATTERN).optional(),
});
export type AdminInvoiceListParams = z.infer<typeof AdminInvoiceListParamsSchema>;

export const AdminInvoiceSchema = InvoiceSummarySchema.extend({
  buyerName: z.string().describe("Nom du client figé sur la facture"),
  paymentMethod: z.enum(["airtel", "moov", "cod"]),
  email: z
    .enum(["sent", "pending", "failed"])
    .describe(
      "Envoi par e-mail : parti, en cours d'essais, ou abandonné (pas d'adresse vérifiée, 5 échecs)",
    ),
  emailSentAt: z.iso.datetime().nullable(),
}).meta({ id: "AdminInvoice", description: "Facture ou avoir vu par la Finance" });
export type AdminInvoice = z.infer<typeof AdminInvoiceSchema>;

export const AdminInvoicePageSchema = z
  .object({
    items: z.array(AdminInvoiceSchema).max(50),
    nextCursor: z.string().regex(ADMIN_INVOICE_CURSOR_PATTERN).nullable(),
  })
  .meta({
    id: "AdminInvoicePage",
    description: "Factures et avoirs, du plus récent au plus ancien",
  });
export type AdminInvoicePage = z.infer<typeof AdminInvoicePageSchema>;

export const AdminInvoiceParamsSchema = z.strictObject({
  number: z.string().regex(INVOICE_NUMBER_PATTERN),
});

export const CashToCollectSchema = z
  .object({
    reference: orderReference,
    status: z.enum(["shipped", "delivered"]),
    total: fcfa.describe("Montant à encaisser : le total de la commande"),
    cityName: z.string(),
    createdAt: z.iso.datetime(),
  })
  .meta({
    id: "CashToCollect",
    description: "Commande payée en espèces à la livraison, pas encore encaissée",
  });
export type CashToCollect = z.infer<typeof CashToCollectSchema>;

export const CashToCollectListSchema = z
  .object({ items: z.array(CashToCollectSchema).max(100) })
  .meta({
    id: "CashToCollectList",
    description: "Espèces à encaisser (100 au plus) : livrées d'abord, puis les plus anciennes",
  });
export type CashToCollectList = z.infer<typeof CashToCollectListSchema>;

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
    city: shopText(SHOP_LIMITS.cityMax).describe(
      "Ville de la boutique, choisie dans la liste de la livraison (S7.5-T07)",
    ),
    neighborhood: z
      .string()
      .max(80)
      .optional()
      .describe(
        "Quartier de la liste de la ville ; vide ou « Autre quartier » : non précisé (S7.5-T07)",
      ),
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
  neighborhood: z.string().nullable().describe("Quartier (S7.5-T07) ; vide : non précisé"),
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

/** « Ma boutique » (S7.5-T07) : ce que le vendeur change lui-même, sans nouvel examen (jamais le nom). */
export const ShopProfileRequestSchema = z
  .strictObject({
    city: shopText(SHOP_LIMITS.cityMax).describe("Ville, choisie dans la liste de la livraison"),
    neighborhood: z
      .string()
      .max(80)
      .optional()
      .describe("Quartier de la liste de la ville ; vide ou « Autre quartier » : non précisé"),
    description: shopText(SHOP_LIMITS.descriptionMax).describe(
      `Ce que vend la boutique (${SHOP_LIMITS.descriptionMin} à ${SHOP_LIMITS.descriptionMax} caractères)`,
    ),
  })
  .meta({ id: "ShopProfileRequest", description: "Ville, quartier et description de sa boutique" });
export type ShopProfileRequest = z.infer<typeof ShopProfileRequestSchema>;

/** Boutique vue par tout le monde (S7.5-T07) : ni téléphone, ni propriétaire, ni identifiant interne. */
export const PublicShopSchema = z
  .object({
    slug,
    name: z.string(),
    city: z.string(),
    neighborhood: z.string().nullable(),
    description: z.string(),
    official: z.boolean().describe("Boutique Kemdia (« Boutique officielle »)"),
    since: z.iso.datetime().describe("Vend sur Kemdia depuis (première validation)"),
    productCount: z.int().nonnegative().describe("Produits en vente (fiches visibles)"),
  })
  .meta({ id: "PublicShop", description: "Boutique publique (annuaire et page de la boutique)" });
export type PublicShop = z.infer<typeof PublicShopSchema>;

export const PublicShopPageSchema = z
  .object({
    items: z.array(PublicShopSchema),
    page: z.int().min(1),
    pageSize: z.int().min(1),
    total: z.int().nonnegative(),
    totalPages: z.int().min(1),
  })
  .meta({ id: "PublicShopPage", description: "Une page de l'annuaire des boutiques" });
export type PublicShopPage = z.infer<typeof PublicShopPageSchema>;

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

// --- Produits des vendeurs et modération (S6-T02, ADR-0033) ---

const L = VENDOR_PRODUCT_LIMITS;
/** Borne large : la longueur exacte (espaces retirés) est vérifiée par l'API (`PRODUIT_INVALIDE`, 422). */
const loose = (max: number) => z.string().max(max * 2);
const vendorPrice = z.int().positive().max(100_000_000).describe("Prix en FCFA, entier (BR-004)");
const vendorStock = z
  .int()
  .nonnegative()
  .max(1_000_000)
  .describe("Quantité disponible (hors commandes en cours)");

const productContentFields = {
  title: loose(L.titleMax).describe(`Titre (${L.titleMin} à ${L.titleMax} caractères)`),
  description: loose(L.descriptionMax).describe(
    `Description (${L.descriptionMin} à ${L.descriptionMax} caractères)`,
  ),
  brand: loose(L.brandMax).nullable().optional().describe("Marque (vide : sans marque)"),
  categoryId: uuid.describe("Catégorie du produit (casse ignorée)"),
};

export const VendorVariantInputSchema = z
  .strictObject({
    name: loose(L.variantNameMax).describe("Nom de la variante (« Noir · 128 Go »)"),
    attributes: z
      .record(z.string().max(30), z.string().max(40))
      .refine((value) => Object.keys(value).length <= 10, "10 caractéristiques au plus")
      .optional()
      .describe("Caractéristiques : { « couleur » : « Noir » } (10 au plus)"),
    price: vendorPrice,
    compareAtPrice: vendorPrice.nullable().optional().describe("Prix barré, supérieur au prix"),
    stock: vendorStock,
  })
  .meta({ id: "VendorVariantInput", description: "Variante d'un nouveau produit" });

export const VendorProductCreateRequestSchema = z
  .strictObject({
    ...productContentFields,
    variants: z.array(VendorVariantInputSchema).min(1).max(L.variantsMax),
  })
  .meta({
    id: "VendorProductCreateRequest",
    description:
      "Nouveau produit d'un vendeur : envoyé en modération, invisible jusqu'à sa validation (BR-003)",
  });
export type VendorProductCreateRequest = z.infer<typeof VendorProductCreateRequestSchema>;

export const VendorProductContentRequestSchema = z.strictObject(productContentFields).meta({
  id: "VendorProductContentRequest",
  description:
    "Titre, description, marque, catégorie : le produit repasse en modération (caché en attendant)",
});
export type VendorProductContentRequest = z.infer<typeof VendorProductContentRequestSchema>;

export const VendorVariantUpdateRequestSchema = z
  .strictObject({
    price: vendorPrice.optional(),
    compareAtPrice: vendorPrice.nullable().optional(),
    stock: vendorStock.optional(),
    previousStock: vendorStock
      .optional()
      .describe("Stock lu avant la modification : obligatoire avec `stock` (refusé s'il a changé)"),
    isActive: z.boolean().optional().describe("Variante proposée à la vente"),
  })
  .refine((body) => (body.stock === undefined) === (body.previousStock === undefined), {
    message: "« stock » et « previousStock » vont ensemble",
  })
  .refine(
    (body) =>
      body.price !== undefined ||
      body.compareAtPrice !== undefined ||
      body.stock !== undefined ||
      body.isActive !== undefined,
    { message: "rien à modifier" },
  )
  .meta({
    id: "VendorVariantUpdateRequest",
    description: "Prix, prix barré, stock ou activation d'une variante : sans nouvelle modération",
  });
export type VendorVariantUpdateRequest = z.infer<typeof VendorVariantUpdateRequestSchema>;

export const VendorVariantSchema = z
  .object({
    id: uuid,
    listingVariantId: uuid.describe("Déclinaison de la fiche commune (S7.5-T02)"),
    sku: z.string(),
    name: z.string(),
    attributes: z.record(z.string(), z.string()),
    price: fcfa,
    compareAtPrice: fcfa.nullable(),
    stock: z.int().nonnegative(),
    isActive: z.boolean(),
  })
  .meta({ id: "VendorVariant", description: "Variante d'un produit de vendeur" });

const vendorProductFields = {
  id: uuid,
  slug,
  listing: z
    .object({
      id: uuid,
      slug: slug.describe("Adresse de la fiche sur le site"),
      status: z.enum(VENDOR_PRODUCT_STATUSES),
      editable: z
        .boolean()
        .describe(
          "La boutique peut modifier le contenu (titre, photos…) : fiche créée par elle et pas encore en ligne",
        ),
      variants: z
        .array(
          z.object({ id: uuid, name: z.string(), attributes: z.record(z.string(), z.string()) }),
        )
        .describe("Déclinaisons de la fiche (S7.5-T03 : celles que l'offre peut ajouter)"),
    })
    .describe("Fiche commune sur laquelle la boutique vend (S7.5-T02)"),
  title: z.string(),
  description: z.string(),
  brand: z.string().nullable(),
  categoryId: uuid,
  images: z.array(z.string()),
  status: z.enum(VENDOR_PRODUCT_STATUSES),
  moderationReason: z.string().nullable().describe("Motif du refus, montré au vendeur"),
  visible: z.boolean().describe("Visible des clients : en ligne ET boutique non suspendue"),
  submittedAt: z.iso.datetime().nullable().describe("Dernier envoi en modération"),
  reviewedAt: z.iso.datetime().nullable().describe("Dernière décision de la modération"),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
  variants: z.array(VendorVariantSchema),
};

export const VendorProductSchema = z
  .object(vendorProductFields)
  .meta({ id: "VendorProduct", description: "Un produit de la boutique du compte connecté" });
export type VendorProduct = z.infer<typeof VendorProductSchema>;

export const VENDOR_PRODUCT_CURSOR_PATTERN = /^[A-Za-z0-9_-]{20,120}$/;

export const VendorProductListParamsSchema = z.strictObject({
  status: z.enum(VENDOR_PRODUCT_STATUSES).optional(),
  limit: z.coerce
    .number()
    .int()
    .min(1)
    .max(VENDOR_PRODUCT_PAGE_MAX)
    .default(VENDOR_PRODUCT_PAGE_DEFAULT),
  after: z.string().regex(VENDOR_PRODUCT_CURSOR_PATTERN).optional(),
});
export type VendorProductListParams = z.infer<typeof VendorProductListParamsSchema>;

export const VendorProductPageSchema = z
  .object({
    items: z.array(VendorProductSchema),
    nextCursor: z.string().regex(VENDOR_PRODUCT_CURSOR_PATTERN).nullable(),
  })
  .meta({
    id: "VendorProductPage",
    description: "Produits de la boutique, du plus récent au plus ancien",
  });
export type VendorProductPage = z.infer<typeof VendorProductPageSchema>;

export const VendorProductIdParamsSchema = z.strictObject({ productId: uuidInput });

// --- Photos des produits (S6-T04, ADR-0035) ---

export const ProductImageParamsSchema = z.strictObject({
  productId: uuidInput,
  imageId: uuidInput,
});
/** Photo publique : `large` (1 600 px au plus) ou `small` (vignette, 480 px). */
export const PublicProductImageParamsSchema = z.strictObject({
  imageId: uuidInput,
  size: z.enum(["large", "small"]),
});

export const ProductImageOrderRequestSchema = z
  .strictObject({
    images: z
      .array(uuid)
      .min(1)
      .max(PRODUCT_IMAGE_LIMITS.maxPerProduct)
      .describe(
        "Identifiants de TOUTES les photos du produit, dans le nouvel ordre (la première est la principale)",
      ),
  })
  .meta({
    id: "ProductImageOrderRequest",
    description: "Nouvel ordre des photos d'un produit (sans nouvelle modération)",
  });
export type ProductImageOrderRequest = z.infer<typeof ProductImageOrderRequestSchema>;
export const VendorVariantParamsSchema = z.strictObject({
  productId: uuidInput,
  variantId: uuidInput,
});

// --- Fiches communes et offres (S7.5-T02, ADR-0049) ---

export const ListingVariantSchema = z
  .object({ id: uuid, name: z.string(), attributes: z.record(z.string(), z.string()) })
  .meta({
    id: "ListingVariant",
    description: "Déclinaison d'une fiche commune (« Noir · 128 Go »)",
  });

export const VendorListingSearchParamsSchema = z.strictObject({
  q: z.string().min(2).max(100).describe("Mots cherchés dans le titre, la marque, la catégorie"),
  limit: z.coerce.number().int().min(1).max(20).default(10),
});
export type VendorListingSearchParams = z.infer<typeof VendorListingSearchParamsSchema>;

export const VendorListingSchema = z
  .object({
    id: uuid,
    slug,
    title: z.string(),
    brand: z.string().nullable(),
    categoryId: uuid,
    image: z.string().nullable(),
    offerCount: z.int().nonnegative().describe("Boutiques qui le vendent déjà"),
    price: fcfa.describe("Prix « à partir de » des offres en ligne"),
    variants: z.array(ListingVariantSchema),
    myOfferId: uuid
      .nullable()
      .describe("Offre de votre boutique sur cette fiche, s'il y en a une (sinon : la créer)"),
  })
  .meta({ id: "VendorListing", description: "Fiche en ligne trouvée par un vendeur" });
export type VendorListing = z.infer<typeof VendorListingSchema>;

export const VendorListingPageSchema = z.object({ items: z.array(VendorListingSchema) }).meta({
  id: "VendorListingPage",
  description: "Fiches en ligne qui correspondent à la recherche",
});
export type VendorListingPage = z.infer<typeof VendorListingPageSchema>;

export const ListingIdParamsSchema = z.strictObject({ listingId: uuidInput });

export const OfferLineSchema = z
  .strictObject({
    listingVariantId: uuid.describe("Déclinaison de la fiche"),
    price: vendorPrice,
    compareAtPrice: vendorPrice.nullable().optional().describe("Prix barré, supérieur au prix"),
    stock: vendorStock,
  })
  .meta({ id: "OfferLine", description: "Prix et stock d'une déclinaison dans une offre" });
export type OfferLine = z.infer<typeof OfferLineSchema>;

export const OfferCreateRequestSchema = z
  .strictObject({ variants: z.array(OfferLineSchema).min(1).max(L.variantsMax) })
  .meta({
    id: "OfferCreateRequest",
    description:
      "Offre de la boutique sur une fiche en ligne : en ligne tout de suite (prix et stock seulement)",
  });
export type OfferCreateRequest = z.infer<typeof OfferCreateRequestSchema>;

export const ADMIN_LISTING_CURSOR_PATTERN = /^[A-Za-z0-9_-]{20,120}$/;

export const AdminListingSchema = z
  .object({
    id: uuid,
    slug,
    title: z.string(),
    description: z.string(),
    brand: z.string().nullable(),
    categoryId: uuid,
    images: z.array(z.string()),
    status: z.enum(VENDOR_PRODUCT_STATUSES),
    createdByShopId: uuid.describe("Boutique qui a créé la fiche"),
    mergedIntoId: uuid.nullable().describe("Fiche qui remplace ce doublon"),
    offerCount: z.int().nonnegative().describe("Offres visibles"),
    price: fcfa.describe("Prix « à partir de » des offres visibles"),
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
    variants: z.array(ListingVariantSchema),
  })
  .meta({ id: "AdminListing", description: "Fiche commune vue par l'équipe (S7.5-T02)" });
export type AdminListing = z.infer<typeof AdminListingSchema>;

export const AdminListingListParamsSchema = z.strictObject({
  q: z.string().max(100).optional().describe("Mots cherchés (titre, marque, catégorie)"),
  status: z.enum(VENDOR_PRODUCT_STATUSES).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  after: z.string().regex(ADMIN_LISTING_CURSOR_PATTERN).optional(),
});
export type AdminListingListParams = z.infer<typeof AdminListingListParamsSchema>;

export const AdminListingPageSchema = z
  .object({
    items: z.array(AdminListingSchema),
    nextCursor: z.string().regex(ADMIN_LISTING_CURSOR_PATTERN).nullable(),
  })
  .meta({ id: "AdminListingPage", description: "Fiches, de la plus récente à la plus ancienne" });
export type AdminListingPage = z.infer<typeof AdminListingPageSchema>;

export const ListingUpdateRequestSchema = z
  .strictObject({
    title: productContentFields.title.optional(),
    description: productContentFields.description.optional(),
    brand: productContentFields.brand,
    categoryId: productContentFields.categoryId.optional(),
    variants: z
      .array(
        z.strictObject({
          id: uuid.optional().describe("Déclinaison à renommer ; absent : nouvelle déclinaison"),
          name: loose(L.variantNameMax),
          attributes: z
            .record(z.string().max(30), z.string().max(40))
            .refine((value) => Object.keys(value).length <= 10, "10 caractéristiques au plus")
            .optional(),
        }),
      )
      .max(50)
      .optional(),
  })
  .refine((body) => Object.values(body).some((v) => v !== undefined), {
    message: "rien à modifier",
  })
  .meta({
    id: "ListingUpdateRequest",
    description:
      "Correction d'une fiche par l'équipe (recopiée sur toutes ses offres) : contenu, déclinaisons renommées ou ajoutées",
  });
export type ListingUpdateRequest = z.infer<typeof ListingUpdateRequestSchema>;

export const ListingMergeRequestSchema = z
  .strictObject({
    into: uuid.describe("Fiche en ligne qui remplace le doublon"),
    variants: z
      .record(uuid, uuid)
      .refine((value) => Object.keys(value).length <= 50, "50 déclinaisons au plus")
      .describe("Déclinaison du doublon → déclinaison de la fiche cible (toutes celles vendues)"),
  })
  .meta({
    id: "ListingMergeRequest",
    description: "Fusion d'un doublon : ses offres passent sur la fiche cible, son adresse y mène",
  });
export type ListingMergeRequest = z.infer<typeof ListingMergeRequestSchema>;

export const ListingImageParamsSchema = z.strictObject({
  listingId: uuidInput,
  imageId: uuidInput,
});

// --- Propositions de correction (S7.5-T03) ---

const C = LISTING_CORRECTION_LIMITS;
export const CORRECTION_CURSOR_PATTERN = /^[A-Za-z0-9_-]{20,120}$/;

export const CorrectionCreateRequestSchema = z
  .strictObject({
    message: loose(C.messageMax).describe(
      `Ce qu'il faut corriger sur la fiche (${C.messageMin} à ${C.messageMax} caractères)`,
    ),
  })
  .meta({ id: "CorrectionCreateRequest", description: "Correction proposée à l'équipe" });
export type CorrectionCreateRequest = z.infer<typeof CorrectionCreateRequestSchema>;

export const ListingCorrectionSchema = z
  .object({
    id: uuid,
    listing: z.object({ id: uuid, slug, title: z.string() }),
    shop: z.object({ id: uuid, name: z.string() }).nullable(),
    message: z.string(),
    createdAt: z.iso.datetime(),
    closedAt: z.iso.datetime().nullable(),
    note: z.string().nullable().describe("Réponse de l'équipe à la clôture"),
  })
  .meta({
    id: "ListingCorrection",
    description: "Proposition de correction d'une fiche (S7.5-T03)",
  });
export type ListingCorrection = z.infer<typeof ListingCorrectionSchema>;

export const ListingCorrectionListParamsSchema = z.strictObject({
  status: z.enum(["open", "closed"]).default("open"),
  listingId: uuidInput.optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  after: z.string().regex(CORRECTION_CURSOR_PATTERN).optional(),
});
export type ListingCorrectionListParams = z.infer<typeof ListingCorrectionListParamsSchema>;

export const ListingCorrectionPageSchema = z
  .object({
    items: z.array(ListingCorrectionSchema),
    nextCursor: z.string().regex(CORRECTION_CURSOR_PATTERN).nullable(),
  })
  .meta({
    id: "ListingCorrectionPage",
    description: "Ouvertes : de la plus ancienne à la plus récente ; closes : l'inverse",
  });
export type ListingCorrectionPage = z.infer<typeof ListingCorrectionPageSchema>;

export const CorrectionIdParamsSchema = z.strictObject({ correctionId: uuidInput });

export const CorrectionCloseRequestSchema = z
  .strictObject({
    note: z
      .string()
      .max(C.noteMax * 2)
      .optional()
      .describe(`Réponse montrée au vendeur (${C.noteMax} caractères au plus)`),
  })
  .meta({ id: "CorrectionCloseRequest", description: "Clôture d'une proposition de correction" });
export type CorrectionCloseRequest = z.infer<typeof CorrectionCloseRequestSchema>;

export const OfferWithdrawRequestSchema = z
  .strictObject({
    reason: loose(L.reasonMax).describe(
      `Motif montré au vendeur (${L.reasonMin} à ${L.reasonMax} caractères)`,
    ),
  })
  .meta({ id: "OfferWithdrawRequest", description: "Retrait d'une offre par l'équipe" });
export type OfferWithdrawRequest = z.infer<typeof OfferWithdrawRequestSchema>;

export const ModerationProductSchema = z
  .object({
    ...vendorProductFields,
    shop: z
      .object({ id: uuid, name: z.string(), status: z.enum(SHOP_STATUSES) })
      .nullable()
      .describe("Boutique du vendeur"),
    reviewedBy: uuid.nullable().describe("Modérateur de la dernière décision"),
  })
  .meta({ id: "ModerationProduct", description: "Un produit de vendeur vu par la modération" });
export type ModerationProduct = z.infer<typeof ModerationProductSchema>;

export const AdminListingDetailSchema = z
  .object({
    listing: AdminListingSchema,
    offers: z
      .array(ModerationProductSchema)
      .describe("Toutes les offres de la fiche, tous statuts"),
  })
  .meta({ id: "AdminListingDetail", description: "Fiche commune et toutes ses offres" });
export type AdminListingDetail = z.infer<typeof AdminListingDetailSchema>;

export const ListingMergeResultSchema = z
  .object({
    listing: AdminListingSchema.describe("Fiche cible, après la fusion"),
    moved: z.int().nonnegative().describe("Offres déplacées"),
  })
  .meta({ id: "ListingMergeResult" });
export type ListingMergeResult = z.infer<typeof ListingMergeResultSchema>;

export const ModerationListParamsSchema = z.strictObject({
  status: z
    .enum(["pending", "published", "rejected"])
    .default("pending")
    .describe("pending (par défaut) : la file à examiner"),
  limit: z.coerce
    .number()
    .int()
    .min(1)
    .max(VENDOR_PRODUCT_PAGE_MAX)
    .default(VENDOR_PRODUCT_PAGE_DEFAULT),
  after: z.string().regex(VENDOR_PRODUCT_CURSOR_PATTERN).optional(),
});
export type ModerationListParams = z.infer<typeof ModerationListParamsSchema>;

export const ModerationProductPageSchema = z
  .object({
    items: z.array(ModerationProductSchema),
    nextCursor: z.string().regex(VENDOR_PRODUCT_CURSOR_PATTERN).nullable(),
  })
  .meta({
    id: "ModerationProductPage",
    description: "Produits à modérer, de la demande la plus ancienne à la plus récente",
  });
export type ModerationProductPage = z.infer<typeof ModerationProductPageSchema>;

const seenSubmittedAt = z.iso
  .datetime()
  .describe(
    "`submittedAt` du produit tel que le modérateur l'a lu : refusé (`PRODUIT_MODIFIE`) si le vendeur l'a renvoyé depuis",
  );

export const ProductApprovalSchema = z
  .strictObject({ submittedAt: seenSubmittedAt })
  .meta({ id: "ProductApproval", description: "Validation de la version lue par le modérateur" });
export type ProductApproval = z.infer<typeof ProductApprovalSchema>;

export const ProductModerationReasonSchema = z
  .strictObject({
    reason: z
      .string()
      .max(L.reasonMax * 2)
      .describe(`Motif montré au vendeur (${L.reasonMin} à ${L.reasonMax} caractères)`),
    submittedAt: seenSubmittedAt,
  })
  .meta({
    id: "ProductModerationReason",
    description: "Refus de la version lue par le modérateur, avec un motif",
  });
export type ProductModerationReason = z.infer<typeof ProductModerationReasonSchema>;

// --- Double authentification de l'équipe (S6-T03, ADR-0034, MED-15) ---

export const SecondFactorStatusSchema = z
  .object({
    enabled: z.boolean().describe("Activée sur ce compte"),
    required: z.boolean().describe("Obligatoire pour ce compte (modérateur ou administrateur)"),
    verifiedUntil: z.iso
      .datetime()
      .nullable()
      .describe("Session confirmée jusqu'à cette heure ; vide : routes d'équipe fermées"),
    recoveryCodesLeft: z.int().nonnegative().describe("Codes de secours encore utilisables"),
  })
  .meta({ id: "SecondFactorStatus", description: "Double authentification du compte connecté" });
export type SecondFactorStatus = z.infer<typeof SecondFactorStatusSchema>;

export const SecondFactorSetupRequestSchema = z
  .strictObject({
    password: z
      .string()
      .max(200)
      .describe("Mot de passe du compte (une session volée ne suffit pas)"),
  })
  .meta({
    id: "SecondFactorSetupRequest",
    description: "Afficher le QR code de la double authentification",
  });
export type SecondFactorSetupRequest = z.infer<typeof SecondFactorSetupRequestSchema>;

export const SecondFactorSetupSchema = z
  .object({
    secret: z
      .string()
      .regex(/^[A-Z2-7]{32}$/)
      .describe("Secret en base32, à taper si le QR code ne passe pas"),
    otpauthUri: z.string().startsWith("otpauth://totp/").describe("Contenu du QR code"),
  })
  .meta({
    id: "SecondFactorSetup",
    description: "Secret à ajouter à l'application d'authentification",
  });
export type SecondFactorSetup = z.infer<typeof SecondFactorSetupSchema>;

export const SecondFactorCodeRequestSchema = z
  .strictObject({
    code: z
      .string()
      .max(30)
      .describe("Code à 6 chiffres de l'application, ou code de secours « abcd-efgh-jkmn »"),
  })
  .meta({ id: "SecondFactorCodeRequest", description: "Un code de double authentification" });
export type SecondFactorCodeRequest = z.infer<typeof SecondFactorCodeRequestSchema>;

const recoveryCodes = z
  .array(z.string().regex(RECOVERY_CODE_PATTERN))
  .length(RECOVERY_CODE_COUNT)
  .describe("Codes de secours, donnés UNE seule fois : à noter et ranger hors du téléphone");

export const SecondFactorEnabledSchema = z
  .object({ recoveryCodes, verifiedUntil: z.iso.datetime() })
  .meta({
    id: "SecondFactorEnabled",
    description: "Double authentification activée, session confirmée",
  });
export type SecondFactorEnabled = z.infer<typeof SecondFactorEnabledSchema>;

export const SecondFactorVerifiedSchema = z
  .object({ verifiedUntil: z.iso.datetime(), recoveryCodesLeft: z.int().nonnegative() })
  .meta({ id: "SecondFactorVerified", description: "Session confirmée pour 15 minutes" });
export type SecondFactorVerified = z.infer<typeof SecondFactorVerifiedSchema>;

export const RecoveryCodesSchema = z.object({ recoveryCodes }).meta({
  id: "RecoveryCodes",
  description: "Nouveaux codes de secours (les anciens ne servent plus)",
});
export type RecoveryCodes = z.infer<typeof RecoveryCodesSchema>;

// --- Commandes des vendeurs (S6-T07, ADR-0038 ; BR-013) ---

export const VendorOrderLineSchema = z
  .object({
    variantId: uuid,
    productId: uuid,
    title: z.string(),
    variantName: z.string(),
    unitPrice: fcfa.describe("Prix unitaire au moment de la commande"),
    quantity: cartQuantity,
    lineTotal: fcfa,
  })
  .meta({
    id: "VendorOrderLine",
    description: "Article de la boutique dans la commande (copie figée au moment de la commande)",
  });
export type VendorOrderLine = z.infer<typeof VendorOrderLineSchema>;

const vendorOrderFields = {
  reference: orderReference,
  status: z.enum(VENDOR_ORDER_STATUSES).describe("Où en est la commande pour cette boutique"),
  orderStatus: z.enum(ORDER_STATUSES).describe("Statut de la commande entière"),
  itemCount: z.int().positive().describe("Nombre d'articles de la boutique (quantités comprises)"),
  subtotal: fcfa.describe(
    "Montant des articles de la boutique, aux prix de la commande (hors livraison et réduction)",
  ),
  cityName: z.string().describe("Ville de livraison : aucune autre donnée du client"),
  receivedAt: z.iso.datetime().describe("Confirmation de la commande : début du délai de réponse"),
  dueAt: z.iso
    .datetime()
    .describe("Sans réponse à cette date, la commande entière est annulée (BR-013)"),
  decidedAt: z.iso.datetime().nullable().describe("Acceptation ou refus par la boutique"),
};

export const VendorOrderSummarySchema = z
  .object(vendorOrderFields)
  .meta({ id: "VendorOrderSummary", description: "Ligne de « Mes commandes » d'un vendeur" });
export type VendorOrderSummary = z.infer<typeof VendorOrderSummarySchema>;

export const VendorOrderSchema = z
  .object({
    ...vendorOrderFields,
    lines: z.array(VendorOrderLineSchema).min(1).max(CART_MAX_LINES),
    refusalReason: z
      .string()
      .nullable()
      .describe("Motif du refus donné par la boutique (jamais montré au client)"),
    canDecide: z.boolean().describe("La boutique peut encore accepter ou refuser"),
  })
  .meta({
    id: "VendorOrder",
    description:
      "Commande vue par une boutique : SES articles seulement, et la ville de livraison (ni nom, ni téléphone, ni adresse du client)",
  });
export type VendorOrder = z.infer<typeof VendorOrderSchema>;

export const VendorOrderListParamsSchema = z.strictObject({
  status: z.enum(VENDOR_ORDER_STATUSES).optional(),
  limit: z.coerce
    .number()
    .int()
    .min(1)
    .max(VENDOR_ORDER_PAGE_MAX)
    .default(VENDOR_ORDER_PAGE_DEFAULT),
  before: z.string().regex(ORDER_CURSOR_PATTERN).optional(),
});
export type VendorOrderListParams = z.infer<typeof VendorOrderListParamsSchema>;

export const VendorOrderPageSchema = z
  .object({
    items: z.array(VendorOrderSummarySchema),
    nextCursor: z.string().regex(ORDER_CURSOR_PATTERN).nullable(),
  })
  .meta({
    id: "VendorOrderPage",
    description: "Commandes de la boutique, de la plus récente à la plus ancienne",
  });
export type VendorOrderPage = z.infer<typeof VendorOrderPageSchema>;

export const VendorOrderRefuseRequestSchema = z
  .strictObject({
    reason: z
      .string()
      .max(VENDOR_ORDER_REFUSAL_LIMITS.max * 2)
      .describe(
        `Motif (${VENDOR_ORDER_REFUSAL_LIMITS.min} à ${VENDOR_ORDER_REFUSAL_LIMITS.max} caractères, espaces retirés) : gardé par Kemdia, jamais montré au client`,
      ),
  })
  .meta({
    id: "VendorOrderRefuseRequest",
    description: "Refus d'une commande par la boutique : la commande ENTIÈRE est annulée",
  });
export type VendorOrderRefuseRequest = z.infer<typeof VendorOrderRefuseRequestSchema>;

// --- Vérification des vendeurs, KYC (S6-T08, ADR-0039 ; BR-024) ---

const K = KYC_LIMITS;
export const KycRequestSchema = z
  .strictObject({
    holderKind: z.enum(KYC_HOLDER_KINDS).describe("Personne seule ou entreprise"),
    legalName: z
      .string()
      .max(K.nameMax * 2)
      .describe(`Nom tel qu'il est écrit sur la pièce (${K.nameMin} à ${K.nameMax} caractères)`),
    idType: z.enum(KYC_ID_TYPES),
    idNumber: z
      .string()
      .max(K.idNumberMax * 2)
      .describe(
        `Numéro de la pièce (${K.idNumberMin} à ${K.idNumberMax} lettres ou chiffres) : chiffré`,
      ),
    rccmNumber: z
      .string()
      .max(K.rccmMax * 2)
      .nullable()
      .describe("Numéro RCCM : obligatoire pour une entreprise, vide sinon"),
    payoutMethod: z.enum(KYC_PAYOUT_METHODS),
    payoutAccount: z
      .string()
      .max(K.bankAccountMax * 2)
      .describe(
        "Mobile gabonais (Airtel, Moov) ou numéro de compte bancaire (RIB / IBAN) : chiffré",
      ),
    payoutHolder: z
      .string()
      .max(K.nameMax * 2)
      .describe("Titulaire du compte de versement"),
  })
  .meta({
    id: "KycRequest",
    description: "Dossier de vérification du vendeur (modifiable tant qu'il n'est pas envoyé)",
  });
export type KycRequest = z.infer<typeof KycRequestSchema>;

const kycDocument = z
  .object({
    kind: z.enum(KYC_DOCUMENT_KINDS),
    uploadedAt: z.iso.datetime(),
  })
  .meta({ id: "KycDocument", description: "Photo envoyée (jamais renvoyée au vendeur)" });

const kycFields = {
  status: z.enum(KYC_STATUSES),
  holderKind: z.enum(KYC_HOLDER_KINDS),
  legalName: z.string(),
  idType: z.enum(KYC_ID_TYPES),
  rccmNumber: z.string().nullable(),
  payoutMethod: z.enum(KYC_PAYOUT_METHODS),
  payoutHolder: z.string(),
  documents: z.array(kycDocument).max(KYC_DOCUMENT_KINDS.length),
  missingDocuments: z
    .array(z.enum(KYC_DOCUMENT_KINDS))
    .describe("Photos encore attendues avant l'envoi"),
  submittedAt: z.iso.datetime().nullable(),
  reviewedAt: z.iso.datetime().nullable(),
  rejectionReason: z.string().nullable().describe("Motif du refus, montré au vendeur"),
};

export const VendorKycSchema = z
  .object({
    ...kycFields,
    idNumberEnd: z.string().describe("4 derniers caractères du numéro de la pièce"),
    payoutAccountEnd: z.string().describe("4 derniers caractères du compte de versement"),
    canEdit: z.boolean().describe("Le dossier peut être modifié et envoyé"),
  })
  .meta({
    id: "VendorKyc",
    description: "Le dossier de vérification du vendeur connecté (numéros masqués)",
  });
export type VendorKyc = z.infer<typeof VendorKycSchema>;

export const AdminKycSummarySchema = z
  .object({
    shopId: uuid,
    shopName: z.string(),
    status: z.enum(KYC_STATUSES),
    holderKind: z.enum(KYC_HOLDER_KINDS),
    submittedAt: z.iso.datetime().nullable(),
    reviewedAt: z.iso.datetime().nullable(),
  })
  .meta({ id: "AdminKycSummary", description: "Ligne de la file des dossiers de vérification" });
export type AdminKycSummary = z.infer<typeof AdminKycSummarySchema>;

export const AdminKycSchema = z
  .object({
    ...kycFields,
    shopId: uuid,
    shopName: z.string(),
    idNumber: z.string().describe("Numéro complet de la pièce (consultation inscrite au journal)"),
    payoutAccount: z
      .string()
      .describe("Compte de versement complet (consultation inscrite au journal)"),
    reviewedBy: uuid.nullable(),
    documentsPurgeAt: z.iso
      .datetime()
      .nullable()
      .describe("Date d'effacement des photos (30 jours après la décision)"),
  })
  .meta({
    id: "AdminKyc",
    description: "Dossier de vérification vu par un administrateur",
  });
export type AdminKyc = z.infer<typeof AdminKycSchema>;

export const KycListParamsSchema = z.strictObject({
  status: z.enum(KYC_STATUSES).optional(),
  limit: z.coerce.number().int().min(1).max(SHOP_PAGE_MAX).default(SHOP_PAGE_DEFAULT),
  after: z.string().regex(SHOP_CURSOR_PATTERN).optional(),
});
export type KycListParams = z.infer<typeof KycListParamsSchema>;

export const AdminKycPageSchema = z
  .object({
    items: z.array(AdminKycSummarySchema),
    nextCursor: z.string().regex(SHOP_CURSOR_PATTERN).nullable(),
  })
  .meta({
    id: "AdminKycPage",
    description: "Dossiers de vérification, du plus ancien envoi au plus récent (file d'attente)",
  });
export type AdminKycPage = z.infer<typeof AdminKycPageSchema>;

export const KycDocumentParamsSchema = z.strictObject({ kind: z.enum(KYC_DOCUMENT_KINDS) });
export const AdminKycDocumentParamsSchema = z.strictObject({
  shopId: uuidInput,
  kind: z.enum(KYC_DOCUMENT_KINDS),
});

// --- Livraisons (S7-T01, ADR-0040 ; BR-021) ---

const zoneId = z.enum(["zone_1", "zone_2", "zone_3", "zone_4"]);
const days = z.int().min(0).max(SHIPPING_LIMITS.daysMax);

export const DeliveryTariffZoneSchema = z
  .object({
    id: zoneId,
    label: z.string(),
    baseFee: z
      .int()
      .nonnegative()
      .max(SHIPPING_LIMITS.baseFeeMax)
      .describe("Frais de base de la zone en FCFA (le supplément de la ville s'y ajoute)"),
    freeThreshold: z
      .int()
      .nonnegative()
      .max(SHIPPING_LIMITS.freeThresholdMax)
      .describe("Livraison offerte dès ce montant d'articles (réduction déduite)"),
    daysMin: days,
    daysMax: days,
  })
  .meta({ id: "DeliveryTariffZone" });
export type DeliveryTariffZone = z.infer<typeof DeliveryTariffZoneSchema>;

export const DeliveryTariffsSchema = z
  .object({
    zones: z.array(DeliveryTariffZoneSchema).length(4),
    updatedAt: z.iso.datetime().nullable(),
  })
  .meta({ id: "DeliveryTariffs", description: "Barème de livraison des 4 zones" });
export type DeliveryTariffs = z.infer<typeof DeliveryTariffsSchema>;

export const DeliveryTariffsRequestSchema = z
  .strictObject({
    zones: z
      .array(
        z.strictObject({
          id: zoneId,
          baseFee: DeliveryTariffZoneSchema.shape.baseFee,
          freeThreshold: DeliveryTariffZoneSchema.shape.freeThreshold,
          daysMin: days,
          daysMax: days,
        }),
      )
      .length(4)
      .describe("Les 4 zones, chacune une fois ; délai minimum ≤ délai maximum"),
  })
  .meta({ id: "DeliveryTariffsRequest" });
export type DeliveryTariffsRequest = z.infer<typeof DeliveryTariffsRequestSchema>;

export const ShipmentEventSchema = z
  .object({
    status: z.enum(SHIPMENT_STATUSES),
    at: z.iso.datetime(),
    note: z.string().nullable(),
  })
  .meta({ id: "ShipmentEvent" });

export const ShipmentSchema = z
  .object({
    reference: orderReference,
    status: z.enum(SHIPMENT_STATUSES),
    carrier: z.string().describe("Transporteur (« manuel » : suivi à la main par l'équipe)"),
    attempt: z.int().positive().describe("Tentative de livraison en cours (1 = première)"),
    cityName: z.string(),
    deliveryFee: z.int().nonnegative().describe("Frais de livraison facturés au client"),
    kemdiaShare: z
      .int()
      .nonnegative()
      .describe("Part de Kemdia : 15 % des frais, entier inférieur (BR-021)"),
    carrierShare: z.int().nonnegative().describe("Part du transporteur : le reste des frais"),
    failureReason: z.string().nullable(),
    handedOverAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
    events: z.array(ShipmentEventSchema),
  })
  .meta({ id: "Shipment", description: "Expédition d'une commande (une par commande)" });
export type Shipment = z.infer<typeof ShipmentSchema>;

/**
 * Livraison vue par le client (S7-T02) : l'état et les étapes, jamais le motif écrit par l'équipe, ni le transporteur,
 * ni les parts des frais (BR-021).
 */
export const CustomerShipmentSchema = z
  .object({
    reference: orderReference,
    status: z.enum(SHIPMENT_STATUSES),
    attempt: z.int().positive().describe("Tentative de livraison en cours (1 = première)"),
    handedOverAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
    events: z.array(z.object({ status: z.enum(SHIPMENT_STATUSES), at: z.iso.datetime() })),
  })
  .meta({ id: "CustomerShipment", description: "Livraison d'une commande, vue par son client" });
export type CustomerShipment = z.infer<typeof CustomerShipmentSchema>;

export const ShipmentListSchema = z
  .object({ items: z.array(ShipmentSchema).max(SHIPPING_LIMITS.listMax) })
  .meta({ id: "ShipmentList" });
export type ShipmentList = z.infer<typeof ShipmentListSchema>;

export const ShipmentListQuerySchema = z.strictObject({ status: z.enum(SHIPMENT_STATUSES) });

export const ReadyOrderSchema = z
  .object({
    reference: orderReference,
    status: z.enum(ORDER_STATUSES),
    paymentMethod,
    paid: z.boolean(),
    total: fcfa,
    deliveryFee: z.int().nonnegative(),
    cityName: z.string(),
    itemCount: z.int().positive(),
    createdAt: z.iso.datetime(),
  })
  .meta({
    id: "ReadyOrder",
    description:
      "Commande prête à remettre au transporteur (payée ou à la livraison, vendeurs d'accord)",
  });
export type ReadyOrder = z.infer<typeof ReadyOrderSchema>;

export const ReadyOrderListSchema = z
  .object({ items: z.array(ReadyOrderSchema).max(SHIPPING_LIMITS.listMax) })
  .meta({ id: "ReadyOrderList" });
export type ReadyOrderList = z.infer<typeof ReadyOrderListSchema>;

const shippingReason = z
  .string()
  .trim()
  .min(SHIPPING_LIMITS.reasonMin)
  .max(SHIPPING_LIMITS.reasonMax);

export const ShipmentFailedRequestSchema = z
  .strictObject({
    reason: shippingReason.describe("Pourquoi la livraison n'a pas pu se faire (client absent…)"),
  })
  .meta({ id: "ShipmentFailedRequest" });
export type ShipmentFailedRequest = z.infer<typeof ShipmentFailedRequestSchema>;

export const ShipmentCancelRequestSchema = z
  .strictObject({ note: shippingReason.describe("Note du service client (journal d'audit)") })
  .meta({ id: "ShipmentCancelRequest" });
export type ShipmentCancelRequest = z.infer<typeof ShipmentCancelRequestSchema>;

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
