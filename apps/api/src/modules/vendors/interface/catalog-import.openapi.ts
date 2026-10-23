/** Description OpenAPI de l'import du catalogue (S8-T03, ADR-0058) ; les schémas viennent de @kemdia/contracts. */

const ref = (id: string) => ({ $ref: `#/components/schemas/${id}` });
const problem = (description: string) => ({
  description,
  content: { "application/problem+json": { schema: ref("ProblemDetails") } },
});
const csvBody = {
  required: true,
  description:
    "Le fichier CSV lui-même (UTF-8, séparateur « ; » ou « , », 2 Mo et 1 000 lignes au plus). En-têtes : boutique, reference, titre, description, marque, categorie, variante, prix, prix_barre, stock.",
  content: { "text/csv": { schema: { type: "string", maxLength: 2_097_152 } } },
};
const responses = (ok: string) => ({
  "200": {
    description: ok,
    content: { "application/json": { schema: ref("CatalogImportReport") } },
  },
  "401": problem("`SESSION_INVALIDE` : jeton absent, inconnu, expiré ou fermé"),
  "403": problem(
    "`ACCES_REFUSE` (rôle Catalogue requis) ou `DEUX_FACTEURS_A_ACTIVER` / `DEUX_FACTEURS_REQUIS`",
  ),
  "409": problem("`BOUTIQUE_OCCUPEE` : une boutique du fichier est en cours de modification"),
  "413": problem("Fichier de plus de 2 Mo"),
  "415": problem("`FICHIER_IMPORT_INVALIDE` : corps absent ou pas en text/csv"),
  "429": problem("Trop de requêtes (voir l'en-tête Retry-After)"),
});
const bearer = [{ session: [] }];

export const catalogImportPaths = {
  "/api/v1/admin/catalog-import/check": {
    post: {
      tags: ["Import du catalogue"],
      summary: "Vérifier un fichier du catalogue, sans rien écrire",
      description:
        "Toutes les erreurs (ligne, colonne, message ; les 100 premières), les boutiques et catégories inconnues, les références déjà importées (ignorées).",
      operationId: "checkCatalogImport",
      security: bearer,
      requestBody: csvBody,
      responses: responses("Compte rendu de la vérification"),
    },
  },
  "/api/v1/admin/catalog-import": {
    post: {
      tags: ["Import du catalogue"],
      summary: "Importer un fichier du catalogue : tout ou rien",
      description:
        "Revérifie tout, puis crée les produits dans une seule transaction, en attente de modération (photos ajoutées ensuite par la boutique). Rien n'est écrit s'il reste une erreur (`valid: false`). Journalisé (`catalog.imported`).",
      operationId: "importCatalog",
      security: bearer,
      requestBody: csvBody,
      responses: responses("Compte rendu de l'import"),
    },
  },
};
