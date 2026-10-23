import { PRODUCT_QUERY_PARAMETERS } from "@kemdia/contracts";

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
        "Seuls les produits publiés sont listés. Une valeur invalide est ignorée (jamais d'erreur) ; une catégorie inconnue donne une liste vide. S7.5-T06 : si aucune fiche ne contient les mots cherchés, ils sont corrigés (fautes de frappe) et `correctedQuery` l'indique ; `exact=1` l'empêche.",
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
  "/api/v1/products/suggestions": {
    get: {
      tags: ["Catalogue"],
      summary: "Suggestions pendant la frappe : produits, rayons et marques (S7.5-T06)",
      description:
        "8 suggestions au plus (4 produits, 2 rayons, 2 marques) contenant les mots tapés ; le dernier mot peut être incomplet. Moins de 2 lettres : listes vides. Si les mots ne trouvent rien, ils sont corrigés comme dans la liste (`correctedQuery`). Limité à 20 appels par minute par adresse (60 par visiteur quand le site relaie).",
      operationId: "searchSuggestions",
      parameters: [
        {
          name: "q",
          in: "query",
          required: false,
          description: "Texte tapé (100 caractères au plus)",
          schema: { type: "string", maxLength: 100 },
        },
      ],
      responses: { "200": json("SearchSuggestions", "Suggestions"), "429": tooMany },
    },
  },
  "/api/v1/shops": {
    get: {
      tags: ["Catalogue"],
      summary: "Annuaire des boutiques (S7.5-T07)",
      description:
        "Boutiques actives seulement, 24 par page : la boutique officielle d'abord, puis celles du quartier `quartier` (« près de chez moi »), puis par nom. Une valeur mal formée est ignorée.",
      operationId: "listPublicShops",
      parameters: [
        {
          name: "ville",
          in: "query",
          required: false,
          description: "Ville (nom de la liste de la livraison)",
          schema: { type: "string", maxLength: 60 },
        },
        {
          name: "quartier",
          in: "query",
          required: false,
          description: "Quartier du client : ses boutiques d'abord (avec `ville`)",
          schema: { type: "string", maxLength: 80 },
        },
        {
          name: "page",
          in: "query",
          required: false,
          description: "Page (à partir de 1)",
          schema: { type: "integer", minimum: 1, default: 1 },
        },
      ],
      responses: { "200": json("PublicShopPage", "Une page de boutiques"), "429": tooMany },
    },
  },
  "/api/v1/shops/{slug}": {
    get: {
      tags: ["Catalogue"],
      summary: "Page publique d'une boutique (S7.5-T07)",
      description:
        "Boutique active seulement (inconnue, en attente ou suspendue : 404). Ses produits : `GET /products?shop={slug}`. Jamais de téléphone.",
      operationId: "getPublicShop",
      parameters: [slugParam("Adresse de la boutique")],
      responses: {
        "200": json("PublicShop", "La boutique"),
        "404": problem("Boutique inconnue ou pas active"),
        "429": tooMany,
      },
    },
  },
  "/api/v1/products/{slug}": {
    get: {
      tags: ["Catalogue"],
      summary: "Fiche produit commune, ses offres et l'offre mise en avant",
      description:
        "S7.5-T02, ADR-0049 : une fiche par produit, toutes les boutiques qui le vendent dans `offers`. Les champs de prix et `variants` sont ceux de l'offre MISE EN AVANT (en stock d'abord, puis la moins chère, puis, à prix égal, une boutique de la ville du client). L'adresse d'un doublon fusionné renvoie la fiche qui le remplace (avec sa propre adresse dans `slug`).",
      operationId: "getProduct",
      parameters: [
        slugParam("Adresse de la fiche"),
        {
          name: "ville",
          in: "query",
          required: false,
          description: "Ville du client : départage deux offres au même prix",
          schema: { type: "string", maxLength: 60 },
        },
      ],
      responses: {
        "200": json("ProductDetail", "Fiche publiée avec au moins une offre visible"),
        "404": problem("Fiche inconnue, en modération, archivée, ou sans offre en vente"),
        "429": tooMany,
      },
    },
  },
  "/api/v1/product-images/{imageId}/{size}": {
    get: {
      tags: ["Catalogue"],
      summary: "Photo d'un produit de vendeur (relayée par le site sous /images/v/…)",
      description:
        "S6-T04, ADR-0035 : servie seulement si son produit est **validé** et sa boutique **active** ; sinon 404, sans dire si elle existe. WebP sans métadonnées. Cache 60 s (+ 5 min pendant la mise à jour) : une photo retirée ou un produit caché cesse d'être servi en 6 minutes au plus. 300 requêtes par minute et par adresse.",
      operationId: "getProductImage",
      parameters: [
        {
          name: "imageId",
          in: "path",
          required: true,
          description: "Identifiant de la photo",
          schema: { type: "string", format: "uuid" },
        },
        {
          name: "size",
          in: "path",
          required: true,
          description: "`large` (1 600 px au plus) ou `small` (vignette, 480 px au plus)",
          schema: { type: "string", enum: ["large", "small"] },
        },
      ],
      responses: {
        "200": {
          description: "La photo (WebP)",
          headers: {
            ETag: { description: "Empreinte de la photo et taille", schema: { type: "string" } },
          },
          content: { "image/webp": { schema: { type: "string", format: "binary" } } },
        },
        "304": { description: "Inchangée (`If-None-Match`)" },
        "400": problem("Paramètre invalide"),
        "404": problem("`PHOTO_INTROUVABLE`"),
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
