import { ADMIN_ASSIGNABLE_ROLES } from "@kemdia/contracts/constants";
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
    "`ACCES_REFUSE` (rôle administrateur requis) ou `DEUX_FACTEURS_A_ACTIVER` / `DEUX_FACTEURS_REQUIS` (double authentification à activer, ou à confirmer depuis 15 minutes)",
  ),
  "429": problem("Plus de 30 requêtes par minute, par adresse ou par compte (`TROP_DE_REQUETES`)"),
};
const RULES = [
  "Réservé aux **administrateurs**, avec une session **confirmée par la double authentification** il y a moins de 15 minutes (sinon `DEUX_FACTEURS_REQUIS` : redonner un code).",
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
    description:
      "`vendor`, `catalog`, `logistics`, `finance` ou `support` (`admin` : commande serveur seulement)",
    schema: { type: "string", enum: [...ADMIN_ASSIGNABLE_ROLES] },
  },
];

const roleChange = (verb: "put" | "delete") => ({
  tags: ["Administration"],
  summary:
    verb === "put"
      ? "Accorder le rôle vendeur ou un rôle de l'équipe à un compte"
      : "Retirer le rôle vendeur ou un rôle de l'équipe d'un compte",
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

const accountParam = [roleParams[0]];
const staffAction = (
  id: string,
  summary: string,
  details: string,
  body?: string,
): Record<string, unknown> => ({
  post: {
    tags: ["Administration"],
    summary,
    description: [
      RULES,
      details,
      "Jamais sur son propre compte (`ROLE_SUR_SOI_INTERDIT`) ni sur un administrateur (`COMPTE_PROTEGE` : commande serveur `admin:revoke`). Le compte est verrouillé pendant l'action ; une ligne est inscrite au journal d'audit dans la même transaction.",
    ].join("\n\n"),
    operationId: id,
    security: bearer,
    parameters: accountParam,
    ...(body
      ? { requestBody: { required: true, content: { "application/json": { schema: ref(body) } } } }
      : {}),
    responses: {
      "200": json("StaffActionResult", "Le compte après l'action, et les sessions fermées"),
      "400": problem("UUID ou corps invalide"),
      ...common,
      "404": problem("`COMPTE_INTROUVABLE` (inconnu ou effacé)"),
      "409": problem("`COMPTE_INACTIF` : compte pas dans le bon état"),
      ...(body ? { "422": problem("`MOTIF_INVALIDE` : 5 à 300 caractères") } : {}),
    },
  },
});

export const adminPaths = {
  "/api/v1/admin/staff": {
    get: {
      tags: ["Administration"],
      summary: "Équipe Kemdia : comptes qui ont au moins un rôle de l'équipe (écran Utilisateurs)",
      description: `${RULES}\n\nTri par nom ; page suivante : repasser \`nextCursor\` dans \`after\`. Les comptes effacés n'y sont jamais.`,
      operationId: "listStaff",
      security: bearer,
      parameters: [
        {
          name: "role",
          in: "query",
          description: "Un seul rôle de l'équipe",
          schema: { type: "string", enum: ["catalog", "logistics", "finance", "support", "admin"] },
        },
        {
          name: "limit",
          in: "query",
          description: "Comptes par page (50 par défaut, 100 au plus)",
          schema: { type: "integer", minimum: 1, maximum: 100, default: 50 },
        },
        {
          name: "after",
          in: "query",
          description: "Position renvoyée par la page précédente (`nextCursor`)",
          schema: { type: "string" },
        },
      ],
      responses: {
        "200": json("StaffPage", "Une page de l'équipe"),
        "400": problem("Paramètre inconnu ou invalide"),
        ...common,
      },
    },
  },
  "/api/v1/admin/accounts/{accountId}/remove-staff": staffAction(
    "removeStaff",
    "Départ d'un employé : rôles de l'équipe retirés, sessions fermées",
    "Tous ses rôles de l'équipe (catalogue, logistique, finance, service client) sont retirés et toutes ses sessions fermées tout de suite. Il garde son compte client (et son rôle vendeur s'il en a un).",
  ),
  "/api/v1/admin/accounts/{accountId}/disable": staffAction(
    "disableAccount",
    "Désactiver un compte (plus aucune connexion)",
    "Le compte ne peut plus se connecter, même comme client (`COMPTE_DESACTIVE`), et toutes ses sessions sont fermées tout de suite. Le motif est gardé au journal d'audit.",
    "AccountDisableRequest",
  ),
  "/api/v1/admin/accounts/{accountId}/enable": staffAction(
    "enableAccount",
    "Réactiver un compte désactivé",
    "Seulement un compte désactivé par l'administration ; un compte effacé (données personnelles) ne revient jamais.",
  ),
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
        "Actions (liste complète dans le schéma `AuditPage`) : rôles, mots de passe, sessions, équipe (`account.disabled`, `account.enabled`, `staff.removed`), service client (`support.account_viewed`, `support.lookup_failed`, `support.orders_viewed`), appareils (`device.new_login`, `device.not_me`)… Conservé 365 jours ; la base refuse toute modification.",
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

const supportCommon = {
  ...common,
  "403": problem(
    "`ACCES_REFUSE` (rôle service client ou administrateur requis) ou `DEUX_FACTEURS_A_ACTIVER` / `DEUX_FACTEURS_REQUIS`",
  ),
};
const SUPPORT_RULES =
  "Service client, **lecture seule** : rôle « support » (ou administrateur), session **confirmée par la double authentification** il y a moins de 15 minutes.";

/** Service client (S7.5-T04, ADR-0051). */
export const supportPaths = {
  "/api/v1/support/accounts/lookup": {
    post: {
      tags: ["Service client"],
      summary: "Retrouver un client par e-mail ou téléphone",
      description: `${SUPPORT_RULES}\n\nL'identifiant est dans le corps (jamais dans l'adresse) ; chaque recherche est inscrite au journal d'audit (\`support.account_viewed\`, ou \`support.lookup_failed\` sans résultat).`,
      operationId: "supportLookupAccount",
      security: bearer,
      requestBody: {
        required: true,
        content: { "application/json": { schema: ref("AdminAccountLookupRequest") } },
      },
      responses: {
        "200": json("SupportAccount", "Le compte trouvé"),
        "400": problem("Corps de requête invalide"),
        ...supportCommon,
        "404": problem("`COMPTE_INTROUVABLE`"),
        "422": problem("`IDENTIFIANT_INVALIDE`"),
      },
    },
  },
  "/api/v1/support/accounts/{accountId}/orders": {
    get: {
      tags: ["Service client"],
      summary: "Commandes d'un client, de la plus récente à la plus ancienne",
      description: SUPPORT_RULES,
      operationId: "supportListOrders",
      security: bearer,
      parameters: [
        ...accountParam,
        {
          name: "limit",
          in: "query",
          description: "Commandes par page",
          schema: { type: "integer", minimum: 1, maximum: 50, default: 10 },
        },
        {
          name: "before",
          in: "query",
          description: "Position renvoyée par la page précédente (`nextCursor`)",
          schema: { type: "string" },
        },
      ],
      responses: {
        "200": json("OrderPage", "Une page de commandes"),
        "400": problem("Paramètre inconnu ou invalide"),
        ...supportCommon,
      },
    },
  },
  "/api/v1/support/accounts/{accountId}/orders/{reference}": {
    get: {
      tags: ["Service client"],
      summary: "Détail d'une commande d'un client",
      description: SUPPORT_RULES,
      operationId: "supportGetOrder",
      security: bearer,
      parameters: [
        ...accountParam,
        {
          name: "reference",
          in: "path",
          required: true,
          description: "Référence de la commande",
          schema: { type: "string" },
        },
      ],
      responses: {
        "200": json("Order", "La commande"),
        "400": problem("Paramètre invalide"),
        ...supportCommon,
        "404": problem("`COMMANDE_INTROUVABLE`"),
      },
    },
  },
};
