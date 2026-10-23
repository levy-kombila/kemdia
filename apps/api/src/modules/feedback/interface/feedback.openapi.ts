/** Description OpenAPI de « Signaler un problème » (S8-T02, ADR-0057) ; les schémas viennent de @kemdia/contracts. */

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
const tooMany = problem("Trop de requêtes (voir l'en-tête Retry-After)");
const session = problem("`SESSION_INVALIDE` : jeton absent, inconnu, expiré ou fermé");
const staff = {
  "401": session,
  "403": problem(
    "`ACCES_REFUSE` (rôle Service client requis) ou `DEUX_FACTEURS_A_ACTIVER` / `DEUX_FACTEURS_REQUIS`",
  ),
  "429": tooMany,
};

export const feedbackPaths = {
  "/api/v1/feedback/problems": {
    post: {
      tags: ["Signalements"],
      summary: "Signaler un problème",
      description:
        "Compte connecté. Description de 10 à 2 000 caractères ; la page est réduite à son chemin (sans paramètres) ; l'appareil est résumé par l'API. 5 par minute et par compte, 20 signalements non résolus au plus.",
      operationId: "reportProblem",
      security: bearer,
      requestBody: {
        required: true,
        content: { "application/json": { schema: ref("ProblemReportRequest") } },
      },
      responses: {
        "201": json("ProblemReportReceipt", "Signalement reçu"),
        "400": problem("Corps invalide"),
        "401": session,
        "422": problem(
          "`SIGNALEMENT_INVALIDE` : description trop courte, trop longue ou interdite",
        ),
        "429": problem("`TROP_DE_SIGNALEMENTS`, ou trop de requêtes (voir Retry-After)"),
      },
    },
  },
  "/api/v1/admin/problems": {
    get: {
      tags: ["Signalements"],
      summary: "Signalements à suivre, du plus ancien au plus récent",
      description: "Service client, avec la double authentification.",
      operationId: "listProblemReports",
      security: bearer,
      parameters: [
        {
          name: "status",
          in: "query",
          required: false,
          schema: { type: "string", enum: ["new", "in_progress", "resolved"], default: "new" },
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
          description: "Position renvoyée par la page précédente (`nextCursor`)",
          schema: { type: "string", pattern: "^[A-Za-z0-9_-]{20,120}$" },
        },
      ],
      responses: {
        "200": json("AdminProblemReportPage", "Une page de signalements"),
        "400": problem("Paramètres invalides"),
        ...staff,
      },
    },
  },
  "/api/v1/admin/problems/{problemId}/status": {
    post: {
      tags: ["Signalements"],
      summary: "Faire avancer un signalement (en cours, résolu, rouvert)",
      description:
        "`version` : `updatedAt` lu ; refus (`SIGNALEMENT_MODIFIE`) si un collègue l'a changé depuis. Journalisé (`problem.updated`).",
      operationId: "updateProblemReportStatus",
      security: bearer,
      parameters: [
        {
          name: "problemId",
          in: "path",
          required: true,
          description: "Identifiant du signalement",
          schema: { type: "string", format: "uuid" },
        },
      ],
      requestBody: {
        required: true,
        content: { "application/json": { schema: ref("ProblemReportStatusRequest") } },
      },
      responses: {
        "200": json("AdminProblemReport", "Signalement à jour"),
        "400": problem("Corps ou identifiant invalide"),
        "404": problem("`SIGNALEMENT_INTROUVABLE`"),
        "409": problem("`SIGNALEMENT_MODIFIE`"),
        ...staff,
      },
    },
  },
};
