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

const SECOND_FACTOR_RULES =
  "Application d'authentification (TOTP, 6 chiffres, 30 s). Obligatoire pour les **modérateurs et administrateurs** : leurs routes d'équipe exigent une session confirmée par un code il y a moins de 15 minutes. **3 mots de passe ou codes faux** : la session est fermée et les codes bloqués 15 minutes ; le titulaire reçoit un avis de sécurité.";
const secondFactorTooMany = problem(
  "`TROP_D_ESSAIS` (3 échecs : session fermée, 15 minutes) ou `TROP_DE_REQUETES` (limite par compte)",
);

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
        "403": problem(
          "`INVITATION_REQUISE` : bêta fermée, adresse sans invitation valable (S8-T02)",
        ),
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
        "403": problem(
          "`INVITATION_REQUISE` : invitation annulée ou expirée, ou inscription fermée, pendant l'inscription (S8-T02)",
        ),
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
  "/api/v1/auth/avatar": {
    post: {
      tags: ["Identité"],
      summary: "Photo de profil : envoyer (S7.5-T08)",
      description:
        "Corps = le fichier (`image/jpeg`, `image/png` ou `image/webp`, 5 Mo au plus, 200 px au moins de chaque côté). Recadrée au centre en carré de 256 px, réencodée en WebP SANS métadonnées. Visible seulement par le titulaire. 10 envois par minute.",
      operationId: "uploadAvatar",
      security: bearer,
      requestBody: {
        required: true,
        content: {
          "image/jpeg": { schema: { type: "string", format: "binary" } },
          "image/png": { schema: { type: "string", format: "binary" } },
          "image/webp": { schema: { type: "string", format: "binary" } },
        },
      },
      responses: {
        "200": {
          description: "Nouvelle version de la photo (aussi dans `account.avatar`)",
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["avatar"],
                properties: { avatar: { type: "string", pattern: "^[0-9a-f]{16}$" } },
              },
            },
          },
        },
        "401": sessionRefused,
        "415": problem("Corps qui n'est pas une image (`PHOTO_INVALIDE`)"),
        "422": problem("`PHOTO_INVALIDE` : format, poids ou dimensions (détail dans le message)"),
        "429": tooMany,
      },
    },
    get: {
      tags: ["Identité"],
      summary: "Photo de profil : la voir (titulaire seulement)",
      description:
        "WebP 256 × 256. `Cache-Control: private, no-cache` et `ETag` (304 si inchangée).",
      operationId: "getAvatar",
      security: bearer,
      responses: {
        "200": { description: "La photo", content: { "image/webp": {} } },
        "304": { description: "Inchangée" },
        "401": sessionRefused,
        "404": problem("`PHOTO_ABSENTE` : pas de photo (le site affiche les initiales)"),
        "429": tooMany,
      },
    },
    delete: {
      tags: ["Identité"],
      summary: "Photo de profil : la retirer (les initiales reviennent)",
      operationId: "deleteAvatar",
      security: bearer,
      responses: {
        "204": { description: "Photo retirée" },
        "401": sessionRefused,
        "404": problem("`PHOTO_ABSENTE` : pas de photo"),
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
        "429": problem(
          "`TROP_DE_REQUETES` : plus de 5 fois par minute pour ce compte (ou limite par adresse)",
        ),
      },
    },
  },
  "/api/v1/auth/devices/not-me": {
    post: {
      tags: ["Identité"],
      summary: "« Ce n'est pas moi » : fermer toutes les sessions après un avis de nouvel appareil",
      description:
        "Le jeton vient du lien de l'avis « nouvelle connexion » (S7.5-T04). Sans session : le titulaire n'a peut-être plus accès à son compte. À usage unique, valable 7 jours ; l'appareil signalé est oublié. Changer ensuite le mot de passe (« Mot de passe oublié »).",
      operationId: "deviceNotMe",
      requestBody: body("DeviceNotMeRequest"),
      responses: {
        "200": json("DeviceNotMeResult", "Toutes les sessions du compte sont fermées"),
        "400": invalidBody,
        "410": problem("`ALERTE_INVALIDE` : lien inconnu, déjà utilisé ou expiré"),
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

  "/api/v1/auth/password/change": {
    post: {
      tags: ["Identité"],
      summary:
        "Changer son mot de passe (mot de passe actuel + nouveau) : reconnecté ici, déconnecté partout ailleurs",
      description:
        "S7-T07 (OWASP ASVS 5.0 V6.2.2, V6.2.3). Toutes les sessions du compte sont fermées, une nouvelle est ouverte et " +
        "un e-mail « mot de passe modifié » est envoyé. Au 3ᵉ mot de passe actuel faux : blocage de 15 minutes et session fermée.",
      operationId: "changePassword",
      security: bearer,
      parameters: [userAgent],
      requestBody: body("ChangePasswordRequest"),
      responses: {
        "200": json("OpenedSession", "Mot de passe changé, nouvelle session ouverte"),
        "400": invalidBody,
        "401": sessionRefused,
        "422": problem(
          "`MOT_DE_PASSE_FAIBLE` (aucun essai consommé) ou `MOT_DE_PASSE_INCORRECT` (mot de passe actuel)",
        ),
        "429": problem(
          "`COMPTE_BLOQUE` : 3 mots de passe actuels faux (15 minutes), ou `TROP_DE_REQUETES`",
        ),
      },
    },
  },

  // --- Double authentification de l'équipe (S6-T03, ADR-0034, MED-15) ---
  "/api/v1/auth/2fa": {
    get: {
      tags: ["Double authentification"],
      summary: "État de la double authentification du compte connecté",
      operationId: "secondFactorStatus",
      security: bearer,
      responses: {
        "200": json(
          "SecondFactorStatus",
          "Activée ? obligatoire ? session confirmée jusqu'à quand ?",
        ),
        "401": sessionRefused,
      },
    },
  },
  "/api/v1/auth/2fa/setup": {
    post: {
      tags: ["Double authentification"],
      summary: "Afficher le QR code (contre le mot de passe du compte)",
      description: `${SECOND_FACTOR_RULES}\n\nModérateurs et administrateurs seulement. Refait autant de fois que voulu tant que la double authentification n'est pas activée.`,
      operationId: "secondFactorSetup",
      security: bearer,
      requestBody: body("SecondFactorSetupRequest"),
      responses: {
        "200": json("SecondFactorSetup", "Secret à ajouter à l'application (QR code ou saisie)"),
        "400": invalidBody,
        "401": sessionRefused,
        "403": problem("`ACCES_REFUSE` : réservé à l'équipe (modérateurs et administrateurs)"),
        "409": problem("`DEUX_FACTEURS_DEJA_ACTIVE`"),
        "422": problem("`MOT_DE_PASSE_INCORRECT`"),
        "429": secondFactorTooMany,
        "503": problem(
          "`DEUX_FACTEURS_INDISPONIBLE` : clé `TOTP_ENCRYPTION_KEY` absente sur ce serveur",
        ),
      },
    },
  },
  "/api/v1/auth/2fa/enable": {
    post: {
      tags: ["Double authentification"],
      summary:
        "Premier code : active la double authentification (10 codes de secours, donnés une fois)",
      description: SECOND_FACTOR_RULES,
      operationId: "secondFactorEnable",
      security: bearer,
      requestBody: body("SecondFactorCodeRequest"),
      responses: {
        "200": json("SecondFactorEnabled", "Activée ; session confirmée pour 15 minutes"),
        "400": invalidBody,
        "401": sessionRefused,
        "403": problem("`ACCES_REFUSE` : réservé à l'équipe"),
        "409": problem(
          "`DEUX_FACTEURS_A_CONFIGURER` (afficher d'abord le QR code) ou `DEUX_FACTEURS_DEJA_ACTIVE`",
        ),
        "422": problem("`CODE_INVALIDE`"),
        "429": secondFactorTooMany,
        "503": problem("`DEUX_FACTEURS_INDISPONIBLE`"),
      },
    },
  },
  "/api/v1/auth/2fa/verify": {
    post: {
      tags: ["Double authentification"],
      summary: "Confirmer la session pour 15 minutes (code de l'application ou code de secours)",
      description: `${SECOND_FACTOR_RULES}\n\nUn code de l'application ne sert qu'une fois ; un code de secours aussi.`,
      operationId: "secondFactorVerify",
      security: bearer,
      requestBody: body("SecondFactorCodeRequest"),
      responses: {
        "200": json("SecondFactorVerified", "Session confirmée pour 15 minutes"),
        "400": invalidBody,
        "401": sessionRefused,
        "403": problem("`DEUX_FACTEURS_A_ACTIVER`"),
        "422": problem("`CODE_INVALIDE`"),
        "429": secondFactorTooMany,
        "503": problem("`DEUX_FACTEURS_INDISPONIBLE`"),
      },
    },
  },
  "/api/v1/auth/2fa/recovery-codes": {
    post: {
      tags: ["Double authentification"],
      summary: "Nouveaux codes de secours (contre un code frais de l'application)",
      description: `${SECOND_FACTOR_RULES}\n\nLes anciens codes de secours ne servent plus. Un code de secours n'est pas accepté ici.`,
      operationId: "secondFactorRecoveryCodes",
      security: bearer,
      requestBody: body("SecondFactorCodeRequest"),
      responses: {
        "200": json("RecoveryCodes", "Les 10 nouveaux codes, donnés une fois"),
        "400": invalidBody,
        "401": sessionRefused,
        "403": problem("`DEUX_FACTEURS_A_ACTIVER`"),
        "422": problem("`CODE_INVALIDE`"),
        "429": secondFactorTooMany,
        "503": problem("`DEUX_FACTEURS_INDISPONIBLE`"),
      },
    },
  },
};
