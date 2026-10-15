/** Description OpenAPI des boutiques (S6-T01) ; les schémas viennent de @kemdia/contracts. */

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
const shopIdParam = {
  name: "shopId",
  in: "path",
  required: true,
  description: "Identifiant de la boutique",
  schema: { type: "string", format: "uuid" },
};

const sessionErrors = {
  "401": problem("`SESSION_INVALIDE` : jeton absent, inconnu, expiré ou fermé"),
};
const adminErrors = {
  ...sessionErrors,
  "403": problem(
    "`ACCES_REFUSE` (rôle administrateur requis), `RECONNEXION_REQUISE` (connexion de plus de 15 minutes) ou `BOUTIQUE_SUR_SOI_INTERDITE` (sa propre boutique)",
  ),
  "429": problem("Plus de 30 requêtes par minute, par adresse ou par compte (`TROP_DE_REQUETES`)"),
};
const decisionErrors = {
  ...adminErrors,
  "404": problem("`BOUTIQUE_INTROUVABLE`"),
  "409": problem(
    "`STATUT_BOUTIQUE_INCOMPATIBLE` (pas dans l'état prévu, ou boutique Kemdia), `PROPRIETAIRE_INACTIF` (compte du vendeur fermé) ou `BOUTIQUE_OCCUPEE` (réessayer)",
  ),
};

const OWNER_RULES = [
  "Compte connecté. **Une boutique par compte** ; elle attend la décision d'un administrateur avant toute vente.",
  "Nom unique (casse, accents et ponctuation ignorés), en lettres latines, chiffres et ponctuation simple, sans « Kemdia ». Mobile de contact gabonais.",
  "Après un **refus**, une nouvelle demande remplace l'ancienne et repart en attente.",
].join("\n\n");
const ADMIN_RULES = [
  "Réservé aux **administrateurs**, avec une session ouverte il y a **moins de 15 minutes**. Chaque décision est inscrite au journal d'audit.",
  "Valider (en attente ou suspendue → active) accorde le rôle **vendeur** ; suspendre (active → suspendue) le retire ; refuser (en attente → refusée) ne change aucun rôle. Boutique, rôle et journal changent ensemble ou pas du tout. Personne ne décide pour sa propre boutique ; la boutique Kemdia n'est jamais concernée.",
].join("\n\n");

const decision = (summary: string, operationId: string, withReason: boolean) => ({
  post: {
    tags: ["Boutiques"],
    summary,
    description: ADMIN_RULES,
    operationId,
    security: bearer,
    parameters: [shopIdParam],
    ...(withReason
      ? {
          requestBody: {
            required: true,
            content: { "application/json": { schema: ref("ShopDecisionReason") } },
          },
        }
      : {}),
    responses: {
      "200": json("AdminShop", "La boutique après la décision"),
      "400": problem(withReason ? "Corps ou identifiant invalide" : "Identifiant invalide"),
      ...decisionErrors,
      ...(withReason
        ? { "422": problem("`BOUTIQUE_INVALIDE` : motif trop court ou trop long") }
        : {}),
    },
  },
});

export const vendorsPaths = {
  "/api/v1/vendors/shop": {
    post: {
      tags: ["Boutiques"],
      summary: "Demander à ouvrir sa boutique",
      description: OWNER_RULES,
      operationId: "applyForShop",
      security: bearer,
      requestBody: {
        required: true,
        content: { "application/json": { schema: ref("ShopApplicationRequest") } },
      },
      responses: {
        "201": json("Shop", "La demande enregistrée (statut « pending »)"),
        "400": problem("Corps invalide"),
        ...sessionErrors,
        "409": problem(
          "`BOUTIQUE_EXISTE` (déjà une boutique en attente, active ou suspendue), `NOM_BOUTIQUE_PRIS` ou `BOUTIQUE_OCCUPEE` (réessayer)",
        ),
        "422": problem("`BOUTIQUE_INVALIDE` : champ mal rempli (détail dans le message)"),
        "429": problem("Plus de 5 demandes par minute pour ce compte (`TROP_DE_REQUETES`)"),
      },
    },
    get: {
      tags: ["Boutiques"],
      summary: "Ma boutique et la décision de l'administration",
      description: OWNER_RULES,
      operationId: "getMyShop",
      security: bearer,
      responses: {
        "200": json(
          "Shop",
          "La boutique du compte (motif affiché en cas de refus ou de suspension)",
        ),
        ...sessionErrors,
        "404": problem("`BOUTIQUE_INTROUVABLE` : aucune demande pour ce compte"),
      },
    },
  },
  "/api/v1/admin/shops": {
    get: {
      tags: ["Boutiques"],
      summary: "Boutiques, de la demande la plus ancienne à la plus récente",
      description: `${ADMIN_RULES}\n\nPage suivante : repasser \`nextCursor\` dans \`after\`.`,
      operationId: "listShops",
      security: bearer,
      parameters: [
        {
          name: "status",
          in: "query",
          description: "Seulement les boutiques dans cet état (ex. `pending` : la file à examiner)",
          schema: { type: "string", enum: ["pending", "active", "rejected", "suspended"] },
        },
        {
          name: "limit",
          in: "query",
          description: "Boutiques par page (50 par défaut, 100 au plus)",
          schema: { type: "integer", minimum: 1, maximum: 100, default: 50 },
        },
        {
          name: "after",
          in: "query",
          description: "`nextCursor` de la page précédente",
          schema: { type: "string" },
        },
      ],
      responses: {
        "200": json("AdminShopPage", "Une page de boutiques"),
        "400": problem("Paramètre invalide"),
        ...adminErrors,
      },
    },
  },
  "/api/v1/admin/shops/{shopId}": {
    get: {
      tags: ["Boutiques"],
      summary: "Une boutique",
      description: ADMIN_RULES,
      operationId: "getShop",
      security: bearer,
      parameters: [shopIdParam],
      responses: {
        "200": json("AdminShop", "La boutique"),
        "400": problem("Identifiant invalide"),
        ...adminErrors,
        "404": problem("`BOUTIQUE_INTROUVABLE`"),
      },
    },
  },
  "/api/v1/admin/shops/{shopId}/approve": decision(
    "Valider ou réactiver une boutique (rôle vendeur accordé)",
    "approveShop",
    false,
  ),
  "/api/v1/admin/shops/{shopId}/reject": decision(
    "Refuser une demande de boutique (motif montré au demandeur)",
    "rejectShop",
    true,
  ),
  "/api/v1/admin/shops/{shopId}/suspend": decision(
    "Suspendre une boutique (rôle vendeur retiré)",
    "suspendShop",
    true,
  ),
};
