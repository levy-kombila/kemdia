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
      summary: "Vérifie le code : le compte est créé, déjà vérifié (BR-041)",
      operationId: "verifySignup",
      requestBody: body("SignupVerifyRequest"),
      responses: {
        "200": json("SignupVerified", "Compte actif"),
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
};
