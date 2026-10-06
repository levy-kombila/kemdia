import { z } from "zod";
import { MAX_AVAILABILITY_LINES } from "../application/catalog.service.js";
import { SORT_KEYS } from "../application/ports.js";
import { MAX_ORDER_QUANTITY } from "../domain/product.js";

/**
 * Contrat HTTP du catalogue. Ces schémas servent trois fois :
 * 1. à valider les corps de requête (POST) ;
 * 2. à produire la documentation OpenAPI (`z.toJSONSchema`) ;
 * 3. dans les tests, à vérifier que chaque réponse réelle respecte la documentation.
 */

const uuid = z.uuid().describe("Identifiant UUID (BR-042)");
const slug = z
  .string()
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
  .describe("Adresse lisible (ex. « telephones-portables »)");
const fcfa = z.int().positive().describe("Montant en FCFA, entier (BR-004)");

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

export interface CategoryNodeDto extends z.infer<typeof CategorySchema> {
  children: CategoryNodeDto[];
}

export const CategoryNodeSchema: z.ZodType<CategoryNodeDto> = CategorySchema.extend({
  get children(): z.ZodArray<z.ZodType<CategoryNodeDto>> {
    return z.array(CategoryNodeSchema);
  },
}).meta({
  id: "CategoryNode",
  description: "Catégorie et ses sous-catégories (3 niveaux au plus, BR-005)",
});

export const CategoryTreeSchema = z
  .object({ items: z.array(CategoryNodeSchema) })
  .meta({ id: "CategoryTree" });

export const CategoryViewSchema = z
  .object({
    category: CategorySchema,
    path: z.array(CategorySchema).describe("Fil d'Ariane, de la racine à la catégorie incluse"),
    children: z.array(CategorySchema),
  })
  .meta({ id: "CategoryView" });

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
    inStock: z.boolean(),
    rating: z.number().min(0).max(5),
    reviewCount: z.int().nonnegative(),
    isFeatured: z.boolean(),
    isBestseller: z.boolean(),
    isNew: z.boolean(),
  })
  .meta({ id: "ProductSummary", description: "Produit dans une liste (carte produit)" });

export const ProductPageSchema = z
  .object({
    items: z.array(ProductSummarySchema),
    page: z.int().min(1),
    pageSize: z.int().min(1),
    total: z.int().nonnegative(),
    totalPages: z.int().min(1),
  })
  .meta({ id: "ProductPage" });

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
    rating: z.number().min(0).max(5),
    reviewCount: z.int().nonnegative(),
    isFeatured: z.boolean(),
    isBestseller: z.boolean(),
    isNew: z.boolean(),
    variants: z.array(VariantSchema).min(1),
  })
  .meta({ id: "ProductDetail", description: "Fiche produit" });

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
        reason: z
          .enum([
            "PRODUIT_INDISPONIBLE",
            "VARIANTE_INCONNUE",
            "QUANTITE_INVALIDE",
            "STOCK_INSUFFISANT",
          ])
          .optional(),
        available: z
          .int()
          .nonnegative()
          .optional()
          .describe("Quantité restante (STOCK_INSUFFISANT)"),
      }),
    ),
  })
  .meta({ id: "AvailabilityResponse" });

/** Paramètres de recherche, pour la documentation (la validation tolérante est dans product-search.ts). */
export const PRODUCT_QUERY_PARAMETERS = [
  {
    name: "category",
    description: "Adresse de la catégorie (sous-catégories comprises)",
    schema: { type: "string" },
  },
  {
    name: "q",
    description: "Mots recherchés (sans accents, 100 caractères au plus)",
    schema: { type: "string" },
  },
  {
    name: "sort",
    description: "Tri",
    schema: { type: "string", enum: [...SORT_KEYS], default: "pertinence" },
  },
  {
    name: "page",
    description: "Page (à partir de 1)",
    schema: { type: "integer", minimum: 1, default: 1 },
  },
  {
    name: "pageSize",
    description: "Produits par page",
    schema: { type: "integer", minimum: 1, maximum: 48, default: 20 },
  },
  { name: "priceMin", description: "Prix minimum (FCFA)", schema: { type: "integer", minimum: 0 } },
  { name: "priceMax", description: "Prix maximum (FCFA)", schema: { type: "integer", minimum: 0 } },
  {
    name: "brands",
    description: "Marques, séparées par des virgules (10 au plus)",
    schema: { type: "string" },
  },
  { name: "inStock", description: "En stock uniquement", schema: { type: "string", enum: ["1"] } },
  {
    name: "onlyDeals",
    description: "En promotion uniquement",
    schema: { type: "string", enum: ["1"] },
  },
  {
    name: "minRating",
    description: "Note minimale",
    schema: { type: "integer", minimum: 1, maximum: 5 },
  },
  {
    name: "scope",
    description: "« promotions » : page Promotions (liste et compteurs limités aux promotions)",
    schema: { type: "string", enum: ["promotions"] },
  },
] as const;
