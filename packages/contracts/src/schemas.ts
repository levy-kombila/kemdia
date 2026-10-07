import { z } from "zod";
import {
  AVAILABILITY_REASONS,
  IDENTITY_ERROR_CODES,
  MAX_AVAILABILITY_LINES,
  MAX_ORDER_QUANTITY,
  OTP_CHANNELS,
  OTP_CODE_PATTERN,
  SIGNUP_TICKET_PATTERN,
  SLUG_PATTERN,
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
      .enum(IDENTITY_ERROR_CODES)
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

export const SignupVerifiedSchema = z.object({ status: z.literal("active") }).meta({
  id: "SignupVerified",
  description: "Compte vérifié (BR-041) : la connexion est possible",
});
export type SignupVerified = z.infer<typeof SignupVerifiedSchema>;

export const SignupResendRequestSchema = z
  .strictObject({ ticket })
  .meta({ id: "SignupResendRequest" });
export type SignupResendRequest = z.infer<typeof SignupResendRequestSchema>;

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
