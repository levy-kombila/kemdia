/** Description OpenAPI des routes de l'identité (les schémas viennent de @kemdia/contracts). */

const ref = (id: string) => ({ $ref: `#/components/schemas/${id}` });
const json = (id: string, description: string) => ({
  description,
  content: { "application/json": { schema: ref(id) } },
});
const body = (id: string) => ({
  required: true,
  content: { "application/json": { schema: ref(id) } },
});
const problem = (description: string) => ({
  description,
  content: { "application/problem+json": { schema: ref("ProblemDetails") } },
});
const tooMany = {
  ...problem(
    "Trop de demandes : `ENVOI_TROP_RAPPROCHE` (60 s entre deux codes), `TROP_D_ENVOIS` (5 par heure), `TROP_D_ESSAIS` (5 essais : redemander un code) ou limite par adresse IP",
  ),
  headers: {
    "Retry-After": {
      description:
        "Secondes avant de réessayer (limites d'envoi et par adresse IP ; absent pour `TROP_D_ESSAIS`)",
      schema: { type: "integer" },
    },
  },
};
const expired = problem(
  "`CODE_EXPIRE` : ticket inconnu, expiré ou remplacé par une nouvelle inscription",
);
const invalidBody = problem("Corps de requête invalide (champ manquant, inconnu ou mal formé)");

const userAgent = {
  name: "X-Kemdia-User-Agent",
  in: "header",
  required: false,
  description: "Navigateur du visiteur, transmis par le serveur du site (liste « mes appareils »)",
  schema: { type: "string", maxLength: 500 },
};
const bearer = [{ session: [] }];
const sessionRefused = problem("`SESSION_INVALIDE` : jeton absent, inconnu, expiré ou fermé");

export const identityPaths = {
  "/api/v1/auth/signup": {
    post: {
      tags: ["Identité"],
      summary: "Inscription : envoie un code et renvoie un ticket",
      description: [
        "Réponse **identique** que l'identifiant ait déjà un compte ou non : dans ce cas, rien n'est modifié et le titulaire reçoit une alerte au lieu d'un code.",
        "Aucun compte n'est créé ici : le compte naît, déjà vérifié, quand le bon code revient (`/signup/verify`).",
        "Le `ticket` renvoyé est exigé pour vérifier le code ou en redemander un ; une nouvelle inscription avec le même identifiant annule les tickets précédents.",
        "L'e-mail part après la réponse : un échec d'envoi n'apparaît pas ici (l'utilisateur redemande un code).",
        "Le SMS est refusé (`CANAL_INDISPONIBLE`) tant que `SMS_ENABLED=false`.",
      ].join("\n\n"),
      operationId: "signup",
      requestBody: body("SignupRequest"),
      responses: {
        "202": json("SignupStarted", "Code envoyé (ou alerte au titulaire)"),
        "400": invalidBody,
        "422": problem(
          "`IDENTIFIANT_INVALIDE`, `NOM_INVALIDE`, `MOT_DE_PASSE_FAIBLE` ou `CANAL_INDISPONIBLE`",
        ),
        "429": tooMany,
      },
    },
  },
  "/api/v1/auth/signup/verify": {
    post: {
      tags: ["Identité"],
      summary:
        "Vérifie le code : le compte est créé, déjà vérifié (BR-041), et le client est connecté",
      operationId: "verifySignup",
      parameters: [userAgent],
      requestBody: body("SignupVerifyRequest"),
      responses: {
        "200": json(
          "SignupVerified",
          "Compte actif et session ouverte (jeton à garder dans un cookie HttpOnly)",
        ),
        "400": invalidBody,
        "410": expired,
        "422": problem("`CODE_INVALIDE` : code incorrect (chaque essai compte)"),
        "429": tooMany,
      },
    },
  },
  "/api/v1/auth/signup/resend": {
    post: {
      tags: ["Identité"],
      summary: "Envoie un nouveau code pour une inscription en cours (l'ancien ne vaut plus rien)",
      operationId: "resendSignupCode",
      requestBody: body("SignupResendRequest"),
      responses: {
        "202": json("SignupStarted", "Nouveau code envoyé"),
        "400": invalidBody,
        "410": expired,
        "429": tooMany,
      },
    },
  },
  "/api/v1/auth/login": {
    post: {
      tags: ["Identité"],
      summary: "Connexion par e-mail ou téléphone ; ouvre une session de 30 jours glissants",
      description: [
        "Réponses identiques qu'un compte existe ou non : `IDENTIFIANTS_INCORRECTS`, puis `COMPTE_BLOQUE` au 3ᵉ essai (BR-040, 15 minutes).",
        "Le blocage se compte par identifiant, même sans compte. Seul un compte désactivé, avec le bon mot de passe, reçoit `COMPTE_DESACTIVE`.",
      ].join("\n\n"),
      operationId: "login",
      parameters: [userAgent],
      requestBody: body("LoginRequest"),
      responses: {
        "200": json("OpenedSession", "Session ouverte"),
        "400": invalidBody,
        "401": problem("`IDENTIFIANTS_INCORRECTS` : identifiant ou mot de passe incorrect"),
        "403": problem("`COMPTE_DESACTIVE` : compte fermé par l'équipe Kemdia"),
        "422": problem("`IDENTIFIANT_INVALIDE` : ni une adresse e-mail ni un mobile gabonais"),
        "429": tooMany,
      },
    },
  },
  "/api/v1/auth/session": {
    get: {
      tags: ["Identité"],
      summary:
        "La session présentée est-elle valable ? (la prolonge au passage, au plus une fois par heure)",
      operationId: "currentSession",
      security: bearer,
      responses: {
        "200": json("CurrentSession", "Session valable"),
        "401": sessionRefused,
        "429": tooMany,
      },
    },
  },
  "/api/v1/auth/logout": {
    post: {
      tags: ["Identité"],
      summary: "Déconnexion : la session est fermée tout de suite",
      operationId: "logout",
      security: bearer,
      responses: { "204": { description: "Session fermée (ou déjà fermée)" }, "429": tooMany },
    },
  },
  "/api/v1/auth/logout-all": {
    post: {
      tags: ["Identité"],
      summary: "Déconnecter tous les appareils du compte (celui-ci compris)",
      operationId: "logoutAll",
      security: bearer,
      responses: {
        "200": json("LogoutAll", "Sessions fermées"),
        "401": sessionRefused,
        "429": tooMany,
      },
    },
  },
  "/api/v1/auth/password/forgot": {
    post: {
      tags: ["Identité"],
      summary: "Mot de passe oublié : envoie un code si un compte existe, et renvoie un ticket",
      description:
        "Réponse **identique** qu'un compte existe ou non ; sans compte, rien n'est envoyé (mêmes limites d'envoi). Une nouvelle demande annule les précédentes.",
      operationId: "forgotPassword",
      requestBody: body("ForgotPasswordRequest"),
      responses: {
        "202": json("ResetStarted", "Demande enregistrée"),
        "400": invalidBody,
        "422": problem("`IDENTIFIANT_INVALIDE` ou `CANAL_INDISPONIBLE`"),
        "429": tooMany,
      },
    },
  },
  "/api/v1/auth/password/resend": {
    post: {
      tags: ["Identité"],
      summary: "Nouveau code pour une demande en cours",
      operationId: "resendResetCode",
      requestBody: body("ResetResendRequest"),
      responses: {
        "202": json("ResetStarted", "Nouveau code envoyé (si un compte existe)"),
        "400": invalidBody,
        "410": expired,
        "422": problem("`CANAL_INDISPONIBLE`"),
        "429": tooMany,
      },
    },
  },
  "/api/v1/auth/password/reset": {
    post: {
      tags: ["Identité"],
      summary: "Nouveau mot de passe : le client est connecté ici et déconnecté partout ailleurs",
      description:
        "Le blocage après 3 erreurs (BR-040) est levé, et un e-mail « mot de passe modifié » est envoyé au titulaire.",
      operationId: "resetPassword",
      parameters: [userAgent],
      requestBody: body("ResetPasswordRequest"),
      responses: {
        "200": json("OpenedSession", "Mot de passe changé, session ouverte"),
        "400": invalidBody,
        "410": expired,
        "422": problem(
          "`MOT_DE_PASSE_FAIBLE` (le code n'est alors pas consommé) ou `CODE_INVALIDE`",
        ),
        "429": tooMany,
      },
    },
  },
};
