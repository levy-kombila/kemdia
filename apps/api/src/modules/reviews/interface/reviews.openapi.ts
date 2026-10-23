/** Description OpenAPI des avis des clients (S8-T01, ADR-0056) ; les schémas viennent de @kemdia/contracts. */

const ref = (id: string) => ({ $ref: `#/components/schemas/${id}` });
const json = (id: string, description: string) => ({
  description,
  content: { "application/json": { schema: ref(id) } },
});
const problem = (description: string) => ({
  description,
  content: { "application/problem+json": { schema: ref("ProblemDetails") } },
});
const bearer = [{ session: [] }];
const slug = {
  name: "slug",
  in: "path",
  required: true,
  description: "Adresse de la fiche produit",
  schema: { type: "string", pattern: "^[a-z0-9]+(?:-[a-z0-9]+)*$", maxLength: 120 },
};
const reviewId = {
  name: "reviewId",
  in: "path",
  required: true,
  description: "Identifiant de l'avis",
  schema: { type: "string", format: "uuid" },
};
const tooMany = problem("Trop de requêtes (voir l'en-tête Retry-After)");
const session = problem("`SESSION_INVALIDE` : jeton absent, inconnu, expiré ou fermé");
const notFound = problem("`PRODUIT_INTROUVABLE` : fiche inconnue ou pas en ligne");
const staff = {
  "401": session,
  "403": problem(
    "`ACCES_REFUSE` (rôle Catalogue requis) ou `DEUX_FACTEURS_A_ACTIVER` / `DEUX_FACTEURS_REQUIS`",
  ),
  "429": tooMany,
};

export const reviewsPaths = {
  "/api/v1/products/{slug}/reviews": {
    get: {
      tags: ["Avis"],
      summary: "Avis publiés d'une fiche, 10 par page, et la répartition des notes",
      description:
        "Public. Seuls les avis publiés sortent, du plus récent au plus ancien ; prénom et initiale de l'auteur seulement, jamais son compte.",
      operationId: "listReviews",
      parameters: [
        slug,
        {
          name: "page",
          in: "query",
          required: false,
          description: "Page (à partir de 1)",
          schema: { type: "integer", minimum: 1, default: 1 },
        },
      ],
      responses: { "200": json("ReviewPage", "Une page d'avis"), "404": notFound, "429": tooMany },
    },
  },
  "/api/v1/products/{slug}/reviews/mine": {
    get: {
      tags: ["Avis"],
      summary: "Mon avis sur cette fiche, et si je peux en donner un",
      operationId: "getMyReview",
      security: bearer,
      parameters: [slug],
      responses: {
        "200": json(
          "MyReview",
          "Mon avis (ou aucun) ; `canReview` : un achat de ce produit a été livré",
        ),
        "401": session,
        "404": notFound,
        "429": tooMany,
      },
    },
    put: {
      tags: ["Avis"],
      summary: "Donner ou modifier mon avis",
      description:
        "Réservé à un client dont une commande contenant ce produit est livrée. Note seule : publiée tout de suite ; avec un commentaire : lue par l'équipe Catalogue avant d'être publiée. 10 par minute et par compte.",
      operationId: "writeMyReview",
      security: bearer,
      parameters: [slug],
      requestBody: {
        required: true,
        content: { "application/json": { schema: ref("ReviewRequest") } },
      },
      responses: {
        "200": json("OwnReview", "Mon avis enregistré (publié ou en attente)"),
        "400": problem("Corps invalide"),
        "401": session,
        "403": problem("`ACHAT_REQUIS` : aucune commande livrée contenant ce produit"),
        "404": notFound,
        "422": problem("`AVIS_INVALIDE` : note ou commentaire mal remplis"),
        "429": tooMany,
      },
    },
    delete: {
      tags: ["Avis"],
      summary: "Retirer mon avis",
      operationId: "deleteMyReview",
      security: bearer,
      parameters: [slug],
      responses: {
        "204": { description: "Avis retiré" },
        "401": session,
        "404": problem("`PRODUIT_INTROUVABLE` ou `AVIS_INTROUVABLE`"),
        "429": tooMany,
      },
    },
  },
  "/api/v1/admin/reviews": {
    get: {
      tags: ["Avis"],
      summary: "File des avis (équipe Catalogue) : en attente par défaut, du plus ancien",
      operationId: "listAdminReviews",
      security: bearer,
      parameters: [
        {
          name: "status",
          in: "query",
          required: false,
          schema: {
            type: "string",
            enum: ["pending", "published", "rejected"],
            default: "pending",
          },
        },
        {
          name: "limit",
          in: "query",
          required: false,
          schema: { type: "integer", minimum: 1, maximum: 100, default: 30 },
        },
        {
          name: "after",
          in: "query",
          required: false,
          description: "`nextCursor` de la page précédente",
          schema: { type: "string" },
        },
      ],
      responses: {
        "200": json("AdminReviewPage", "Une page de la file"),
        "400": problem("Paramètre invalide"),
        ...staff,
      },
    },
  },
  "/api/v1/admin/reviews/{reviewId}/publish": {
    post: {
      tags: ["Avis"],
      summary: "Publier un avis en attente (journal : `review.published`)",
      operationId: "publishReview",
      security: bearer,
      parameters: [reviewId],
      responses: {
        "200": json("AdminReview", "Avis publié"),
        ...staff,
        "404": problem("`AVIS_INTROUVABLE`"),
        "409": problem("`AVIS_DEJA_TRAITE` : l'avis n'attend plus de décision"),
      },
    },
  },
  "/api/v1/admin/reviews/{reviewId}/reject": {
    post: {
      tags: ["Avis"],
      summary:
        "Refuser un avis en attente, avec un motif montré à l'auteur (journal : `review.rejected`)",
      operationId: "rejectReview",
      security: bearer,
      parameters: [reviewId],
      requestBody: {
        required: true,
        content: { "application/json": { schema: ref("ReviewRejectRequest") } },
      },
      responses: {
        "200": json("AdminReview", "Avis refusé"),
        "400": problem("Corps invalide"),
        ...staff,
        "404": problem("`AVIS_INTROUVABLE`"),
        "409": problem("`AVIS_DEJA_TRAITE` : l'avis n'attend plus de décision"),
        "422": problem("`AVIS_INVALIDE` : motif trop court ou trop long"),
      },
    },
  },
};
