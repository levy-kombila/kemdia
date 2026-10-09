/** Description OpenAPI des routes d'administration (S4-T06) ; les schémas viennent de @kemdia/contracts. */

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
const common = {
  "401": problem("`SESSION_INVALIDE` : jeton absent, inconnu, expiré ou fermé"),
  "403": problem(
    "`ACCES_REFUSE` (rôle administrateur requis) ou `RECONNEXION_REQUISE` (connexion de plus de 15 minutes)",
  ),
  "429": problem("Plus de 30 requêtes par minute, par adresse ou par compte (`TROP_DE_REQUETES`)"),
};
const RULES = [
  "Réservé aux **administrateurs**, avec une session ouverte il y a **moins de 15 minutes** (sinon `RECONNEXION_REQUISE` : se reconnecter).",
  "Les rôles sont relus à chaque requête : un rôle retiré ne sert plus, tout de suite.",
].join("\n\n");

const roleParams = [
  {
    name: "accountId",
    in: "path",
    required: true,
    description: "UUID du compte",
    schema: { type: "string", format: "uuid" },
  },
  {
    name: "role",
    in: "path",
    required: true,
    description: "`vendor` ou `moderator` (`admin` : commande serveur seulement)",
    schema: { type: "string", enum: ["vendor", "moderator"] },
  },
];

const roleChange = (verb: "put" | "delete") => ({
  tags: ["Administration"],
  summary:
    verb === "put"
      ? "Accorder le rôle vendeur ou modérateur à un compte"
      : "Retirer le rôle vendeur ou modérateur d'un compte",
  description: [
    RULES,
    "Jamais sur son propre compte (`ROLE_SUR_SOI_INTERDIT`). Sans effet si le compte a déjà (ou n'a déjà plus) ce rôle ; sinon, une ligne est inscrite au journal d'audit dans la même transaction.",
    verb === "put" ? "Le compte doit être actif (`COMPTE_INACTIF`)." : "",
  ]
    .filter(Boolean)
    .join("\n\n"),
  operationId: verb === "put" ? "grantRole" : "revokeRole",
  security: bearer,
  parameters: roleParams,
  responses: {
    "200": json("AdminAccount", "Le compte et ses rôles après le changement"),
    "400": problem("UUID ou rôle invalide (`admin` et `client` sont refusés ici)"),
    ...common,
    "404": problem("`COMPTE_INTROUVABLE`"),
    ...(verb === "put" ? { "409": problem("`COMPTE_INACTIF`") } : {}),
  },
});

export const adminPaths = {
  "/api/v1/admin/accounts/lookup": {
    post: {
      tags: ["Administration"],
      summary: "Retrouver un compte par e-mail ou téléphone",
      description: `${RULES}\n\nL'identifiant est dans le corps : jamais dans l'adresse ni dans les journaux techniques.`,
      operationId: "lookupAccount",
      security: bearer,
      requestBody: {
        required: true,
        content: { "application/json": { schema: ref("AdminAccountLookupRequest") } },
      },
      responses: {
        "200": json("AdminAccount", "Le compte trouvé"),
        "400": problem("Corps de requête invalide"),
        ...common,
        "404": problem("`COMPTE_INTROUVABLE`"),
        "422": problem("`IDENTIFIANT_INVALIDE`"),
      },
    },
  },
  "/api/v1/admin/accounts/{accountId}/roles/{role}": {
    put: roleChange("put"),
    delete: roleChange("delete"),
  },
  "/api/v1/admin/audit": {
    get: {
      tags: ["Administration"],
      summary: "Journal d'audit des actions sensibles, du plus récent au plus ancien",
      description: [
        RULES,
        "Actions : `role.granted`, `role.revoked`, `password.reset`, `sessions.revoked_all`. Conservé 365 jours ; la base refuse toute modification.",
        "Page suivante : repasser `nextCursor` dans `before`.",
      ].join("\n\n"),
      operationId: "listAuditEvents",
      security: bearer,
      parameters: [
        {
          name: "limit",
          in: "query",
          description: "Lignes par page (50 par défaut, 100 au plus)",
          schema: { type: "integer", minimum: 1, maximum: 100, default: 50 },
        },
        {
          name: "before",
          in: "query",
          description: "Position renvoyée par la page précédente (`nextCursor`)",
          schema: { type: "string" },
        },
        {
          name: "action",
          in: "query",
          description: "Une seule action",
          schema: {
            type: "string",
            enum: ["role.granted", "role.revoked", "password.reset", "sessions.revoked_all"],
          },
        },
        {
          name: "accountId",
          in: "query",
          description: "Lignes où ce compte agit ou est la cible",
          schema: { type: "string", format: "uuid" },
        },
      ],
      responses: {
        "200": json("AuditPage", "Une page du journal"),
        "400": problem("Paramètre inconnu ou invalide"),
        ...common,
      },
    },
  },
};
