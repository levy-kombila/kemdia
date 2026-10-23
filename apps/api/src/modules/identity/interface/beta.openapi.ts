/** Description OpenAPI de la bêta fermée (S8-T02, ADR-0057) ; les schémas viennent de @kemdia/contracts. */

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
const admin = {
  "401": problem("`SESSION_INVALIDE` : jeton absent, inconnu, expiré ou fermé"),
  "403": problem(
    "`ACCES_REFUSE` (rôle Administrateur requis) ou `DEUX_FACTEURS_A_ACTIVER` / `DEUX_FACTEURS_REQUIS`",
  ),
  "429": tooMany,
};
const invitationId = {
  name: "invitationId",
  in: "path",
  required: true,
  description: "Identifiant de l'invitation",
  schema: { type: "string", format: "uuid" },
};

export const betaPaths = {
  "/api/v1/auth/beta": {
    get: {
      tags: ["Bêta"],
      summary: "La création de compte est-elle réservée aux invités ?",
      description:
        "Public. Le site l'annonce sur la page d'inscription. Les comptes existants se connectent toujours.",
      operationId: "getBetaStatus",
      responses: { "200": json("BetaStatus", "État de la bêta fermée"), "429": tooMany },
    },
  },
  "/api/v1/admin/beta/settings": {
    get: {
      tags: ["Bêta"],
      summary: "Réglage de la bêta fermée",
      operationId: "getBetaSettings",
      security: bearer,
      responses: { "200": json("BetaSettings", "Réglage actuel"), ...admin },
    },
    put: {
      tags: ["Bêta"],
      summary: "Ouvrir l'inscription à tous, ou la réserver aux invités",
      description: "Journalisé (`settings.beta_updated`).",
      operationId: "updateBetaSettings",
      security: bearer,
      requestBody: {
        required: true,
        content: { "application/json": { schema: ref("BetaSettingsRequest") } },
      },
      responses: {
        "200": json("BetaSettings", "Réglage enregistré"),
        "400": problem("Corps invalide"),
        ...admin,
      },
    },
  },
  "/api/v1/admin/beta/invitations": {
    get: {
      tags: ["Bêta"],
      summary: "Invitations, de la plus récente à la plus ancienne",
      operationId: "listBetaInvitations",
      security: bearer,
      parameters: [
        {
          name: "limit",
          in: "query",
          required: false,
          schema: { type: "integer", minimum: 1, maximum: 100, default: 50 },
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
        "200": json("BetaInvitationPage", "Une page d'invitations"),
        "400": problem("Paramètres invalides"),
        ...admin,
      },
    },
    post: {
      tags: ["Bêta"],
      summary: "Inviter une adresse (ou relancer son invitation : 30 jours de plus)",
      description:
        "L'invitation est liée à l'adresse : la personne crée son compte avec elle, sans code à recopier. Un e-mail part quand c'est possible (`notified`). Journalisé (`beta.invited`, sans l'adresse).",
      operationId: "createBetaInvitation",
      security: bearer,
      requestBody: {
        required: true,
        content: { "application/json": { schema: ref("BetaInvitationRequest") } },
      },
      responses: {
        "201": json("BetaInvitationCreated", "Invitation enregistrée"),
        "400": problem("Corps invalide"),
        "409": problem("`COMPTE_EXISTANT` : cette adresse a déjà un compte"),
        "422": problem("`IDENTIFIANT_INVALIDE` : ni e-mail, ni mobile gabonais"),
        ...admin,
      },
    },
  },
  "/api/v1/admin/beta/invitations/{invitationId}/revoke": {
    post: {
      tags: ["Bêta"],
      summary: "Annuler une invitation pas encore utilisée",
      description:
        "Sans effet sur une invitation déjà annulée. Journalisé (`beta.invitation_revoked`).",
      operationId: "revokeBetaInvitation",
      security: bearer,
      parameters: [invitationId],
      responses: {
        "200": json("BetaInvitation", "Invitation annulée"),
        "400": problem("Identifiant invalide"),
        "404": problem("`INVITATION_INTROUVABLE`"),
        "409": problem("`INVITATION_UTILISEE` : le compte a déjà été créé"),
        ...admin,
      },
    },
  },
};
