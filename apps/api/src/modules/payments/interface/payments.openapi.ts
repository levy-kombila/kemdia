/** Description OpenAPI des paiements et du service client (S5-T04) ; les schémas viennent de @kemdia/contracts. */

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
const reference = {
  name: "reference",
  in: "path",
  required: true,
  description: "Numéro de la commande (ex. KMD-7F3K9Q)",
  schema: { type: "string", pattern: "^KMD-[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{6}$" },
};
const session = {
  "401": problem("`SESSION_INVALIDE` : jeton absent, inconnu, expiré ou fermé"),
  "429": problem("Trop de demandes pour ce compte (`TROP_DE_REQUETES`)"),
};
const admin = {
  "401": problem("`SESSION_INVALIDE` : jeton absent, inconnu, expiré ou fermé"),
  "403": problem(
    "`ACCES_REFUSE` (rôle administrateur requis) ou `RECONNEXION_REQUISE` (connexion de plus de 15 minutes)",
  ),
  "429": problem("Plus de 30 requêtes par minute, par adresse ou par compte (`TROP_DE_REQUETES`)"),
};

const PAYMENT_RULES = [
  "Paiement **Mobile Money** d'une commande en attente de paiement : l'opérateur demande au client de valider sur son téléphone.",
  "**3 essais** au plus, avec le **même opérateur** que la commande (autre numéro possible). Un essai attend la réponse **3 minutes** au plus (jamais au-delà de l'échéance de la commande), puis expire. Le résultat arrive par l'opérateur : interroger `GET` pour le suivre.",
].join("\n\n");
const ADMIN_RULES =
  "Réservé aux **administrateurs**, avec une session ouverte il y a **moins de 15 minutes**. Chaque action est inscrite au journal d'audit.";

export const paymentPaths = {
  "/api/v1/orders/{reference}/payments": {
    post: {
      tags: ["Paiements"],
      summary: "Demander le paiement sur le téléphone (nouvel essai)",
      description: PAYMENT_RULES,
      operationId: "startPayment",
      security: bearer,
      parameters: [reference],
      requestBody: {
        required: true,
        content: { "application/json": { schema: ref("StartPaymentRequest") } },
      },
      responses: {
        "201": json("Payment", "L'essai, en attente de la validation sur le téléphone"),
        "400": problem("Corps ou numéro de commande invalide"),
        ...session,
        "404": problem("`COMMANDE_INTROUVABLE` (n'existe pas ou n'est pas à ce compte)"),
        "409": problem(
          "`PAIEMENT_IMPOSSIBLE` (à la livraison, déjà payée, annulée, délai passé), `PAIEMENT_EN_COURS`, `TROP_D_ESSAIS_PAIEMENT` ou `PANIER_OCCUPE`",
        ),
        "422": problem("`NUMERO_PAIEMENT_INVALIDE` : numéro d'un autre opérateur"),
        "503": problem(
          "`PAIEMENT_INDISPONIBLE` : aucun fournisseur branché ou opérateur injoignable",
        ),
      },
    },
    get: {
      tags: ["Paiements"],
      summary: "Dernier essai de paiement de la commande",
      description: PAYMENT_RULES,
      operationId: "getPayment",
      security: bearer,
      parameters: [reference],
      responses: {
        "200": json("Payment", "Le dernier essai"),
        "400": problem("Numéro de commande invalide"),
        ...session,
        "404": problem("`COMMANDE_INTROUVABLE` ou `PAIEMENT_INTROUVABLE` (aucun essai)"),
      },
    },
  },
  "/api/v1/admin/orders/{reference}/cancel": {
    post: {
      tags: ["Administration"],
      summary: "Annuler une commande (service client)",
      description: `${ADMIN_RULES}\n\nToute commande **pas encore expédiée**, même payée : stock remis en vente, coupon rendu, et un remboursement **à faire** pour chaque paiement Mobile Money reçu. Une commande déjà annulée est renvoyée telle quelle.`,
      operationId: "adminCancelOrder",
      security: bearer,
      parameters: [reference],
      requestBody: {
        required: true,
        content: { "application/json": { schema: ref("AdminCancelOrderRequest") } },
      },
      responses: {
        "200": json("Order", "La commande annulée"),
        "400": problem("Corps ou numéro de commande invalide"),
        ...admin,
        "404": problem("`COMMANDE_INTROUVABLE`"),
        "409": problem(
          "`ANNULATION_IMPOSSIBLE` (expédiée, livrée ou encaissée en espèces) ou `PANIER_OCCUPE`",
        ),
      },
    },
  },
  "/api/v1/admin/orders/{reference}/cod-collected": {
    post: {
      tags: ["Administration"],
      summary: "Noter l'encaissement d'un paiement à la livraison",
      description: `${ADMIN_RULES}\n\nEn attendant le livreur (S7). Le montant doit être **exactement** le total de la commande. Déjà noté : l'encaissement existant est renvoyé (200).`,
      operationId: "codCollected",
      security: bearer,
      parameters: [reference],
      requestBody: {
        required: true,
        content: { "application/json": { schema: ref("CodCollectedRequest") } },
      },
      responses: {
        "200": json("Payment", "Encaissement déjà noté"),
        "201": json("Payment", "Encaissement noté"),
        "400": problem("Corps ou numéro de commande invalide"),
        ...admin,
        "404": problem("`COMMANDE_INTROUVABLE`"),
        "409": problem(
          "`ENCAISSEMENT_IMPOSSIBLE` (pas à la livraison, annulée, montant différent) ou `PANIER_OCCUPE`",
        ),
      },
    },
  },
  "/api/v1/admin/refunds": {
    get: {
      tags: ["Administration"],
      summary: "Remboursements à faire (ou faits)",
      description: `${ADMIN_RULES}\n\nSuivi **manuel** en attendant l'API de l'opérateur : 200 au plus, les plus anciens d'abord.`,
      operationId: "listRefunds",
      security: bearer,
      parameters: [
        {
          name: "status",
          in: "query",
          description: "`to_do` (par défaut) ou `done`",
          schema: { type: "string", enum: ["to_do", "done"], default: "to_do" },
        },
      ],
      responses: {
        "200": json("RefundPage", "Les remboursements"),
        "400": problem("Paramètres invalides"),
        ...admin,
      },
    },
  },
  "/api/v1/admin/refunds/{refundId}/done": {
    post: {
      tags: ["Administration"],
      summary: "Noter un remboursement fait",
      description: `${ADMIN_RULES}\n\nAvec la référence de l'opération chez l'opérateur. La même référence renvoyée ne change rien.`,
      operationId: "refundDone",
      security: bearer,
      parameters: [
        {
          name: "refundId",
          in: "path",
          required: true,
          description: "UUID du remboursement",
          schema: { type: "string", format: "uuid" },
        },
      ],
      requestBody: {
        required: true,
        content: { "application/json": { schema: ref("RefundDoneRequest") } },
      },
      responses: {
        "200": json("Refund", "Le remboursement, noté fait"),
        "400": problem("Corps ou UUID invalide"),
        ...admin,
        "404": problem("`REMBOURSEMENT_INTROUVABLE`"),
        "409": problem("`REMBOURSEMENT_DEJA_FAIT` (avec une autre référence) ou `PANIER_OCCUPE`"),
      },
    },
  },
} as const;
