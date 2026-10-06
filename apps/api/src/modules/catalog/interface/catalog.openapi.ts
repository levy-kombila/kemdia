import { PRODUCT_QUERY_PARAMETERS } from "./schemas.js";

/** Description OpenAPI des routes du catalogue (les schémas viennent de schemas.ts). */

const ref = (id: string) => ({ $ref: `#/components/schemas/${id}` });
const json = (id: string, description: string) => ({
  description,
  content: { "application/json": { schema: ref(id) } },
});
const problem = (description: string) => ({
  description,
  content: { "application/problem+json": { schema: ref("ProblemDetails") } },
});
const slugParam = (description: string) => ({
  name: "slug",
  in: "path",
  required: true,
  description,
  schema: { type: "string", pattern: "^[a-z0-9]+(?:-[a-z0-9]+)*$", maxLength: 120 },
});
const queryParams = PRODUCT_QUERY_PARAMETERS.map((p) => ({ ...p, in: "query", required: false }));
const tooMany = problem("Trop de requêtes (voir l'en-tête Retry-After)");

export const catalogPaths = {
  "/api/v1/categories": {
    get: {
      tags: ["Catalogue"],
      summary: "Arborescence des catégories",
      operationId: "listCategories",
      responses: {
        "200": json("CategoryTree", "Catégories racines et leurs sous-catégories"),
        "429": tooMany,
      },
    },
  },
  "/api/v1/categories/{slug}": {
    get: {
      tags: ["Catalogue"],
      summary: "Une catégorie, son fil d'Ariane et ses sous-catégories",
      operationId: "getCategory",
      parameters: [slugParam("Adresse de la catégorie")],
      responses: {
        "200": json("CategoryView", "Catégorie trouvée"),
        "404": problem("Catégorie inconnue"),
        "429": tooMany,
      },
    },
  },
  "/api/v1/products": {
    get: {
      tags: ["Catalogue"],
      summary: "Liste paginée : catégorie (sous-catégories comprises), recherche, filtres, tri",
      description:
        "Seuls les produits publiés sont listés. Une valeur invalide est ignorée (jamais d'erreur) ; une catégorie inconnue donne une liste vide.",
      operationId: "searchProducts",
      parameters: queryParams,
      responses: { "200": json("ProductPage", "Une page de produits"), "429": tooMany },
    },
  },
  "/api/v1/products/facets": {
    get: {
      tags: ["Catalogue"],
      summary: "Compteurs des filtres (marques, tranches de prix, stock, promotions, note)",
      description:
        "Mêmes paramètres que la liste ; les filtres eux-mêmes ne sont pas appliqués aux compteurs.",
      operationId: "productFacets",
      parameters: queryParams,
      responses: { "200": json("Facets", "Compteurs"), "429": tooMany },
    },
  },
  "/api/v1/products/{slug}": {
    get: {
      tags: ["Catalogue"],
      summary: "Fiche produit, avec ses variantes et leur stock",
      operationId: "getProduct",
      parameters: [slugParam("Adresse du produit")],
      responses: {
        "200": json("ProductDetail", "Produit publié"),
        "404": problem("Produit inconnu, en brouillon ou archivé"),
        "429": tooMany,
      },
    },
  },
  "/api/v1/availability": {
    post: {
      tags: ["Catalogue"],
      summary: "BR-001 : ces lignes de panier sont-elles commandables ?",
      description:
        "Ne modifie rien (la réservation du stock se fait à la commande, S5). Limité à 30 requêtes par minute.",
      operationId: "checkAvailability",
      requestBody: {
        required: true,
        content: { "application/json": { schema: ref("AvailabilityRequest") } },
      },
      responses: {
        "200": json("AvailabilityResponse", "Réponse ligne par ligne"),
        "400": problem("Corps invalide (détail en français)"),
        "429": tooMany,
      },
    },
  },
} as const;
