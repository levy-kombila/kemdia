/** Description OpenAPI du panier serveur (S5-T01) ; les schémas viennent de @kemdia/contracts. */

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
  "429": problem("Trop de requêtes, par adresse ou par compte (`TROP_DE_REQUETES`, `Retry-After`)"),
};
/** Modification refusée parce qu'une autre demande du même compte tient déjà le panier (attente de 1 s au plus). */
const BUSY =
  "`PANIER_OCCUPE` : le panier est déjà en cours de modification par une autre demande (réessayer, `Retry-After`)";

const RULES = [
  "Réservé au **compte connecté** (son propre panier). Toutes les routes renvoient le panier complet, **revérifié dans le catalogue** :",
  "prix actuel (BR-004), produit encore en vente et stock suffisant (BR-001), ligne par ligne. Une variante supprimée du catalogue est retirée du panier.",
  "Le panier ne réserve pas le stock (réservation à la commande, BR-012). 50 lignes au plus, 1 à 20 par ligne ; une quantité trop grande est ramenée au stock disponible.",
].join(" ");

const itemParam = {
  name: "variantId",
  in: "path",
  required: true,
  description: "UUID de la variante",
  schema: { type: "string", format: "uuid" },
};

export const cartPaths = {
  "/api/v1/cart": {
    get: {
      tags: ["Panier"],
      summary: "Le panier du compte, vérifié (sert au passage en caisse)",
      description: `${RULES}\n\n\`ok\` est vrai si le panier n'est pas vide et que toutes ses lignes sont commandables.`,
      operationId: "getCart",
      security: bearer,
      responses: { "200": json("Cart", "Le panier"), ...common },
    },
    delete: {
      tags: ["Panier"],
      summary: "Vider le panier",
      description: RULES,
      operationId: "clearCart",
      security: bearer,
      responses: { "200": json("Cart", "Le panier, vide"), ...common, "409": problem(BUSY) },
    },
  },
  "/api/v1/cart/items": {
    post: {
      tags: ["Panier"],
      summary: "Ajouter une variante (quantités additionnées si elle y est déjà)",
      description: RULES,
      operationId: "addCartItem",
      security: bearer,
      requestBody: {
        required: true,
        content: { "application/json": { schema: ref("CartAddRequest") } },
      },
      responses: {
        "200": json("Cart", "Le panier après l'ajout"),
        "400": problem("Corps invalide (quantité de 1 à 20, UUID)"),
        ...common,
        "404": problem("`VARIANTE_INCONNUE`"),
        "409": problem(
          `\`PRODUIT_INDISPONIBLE\` (plus en vente ou sans stock), \`PANIER_PLEIN\` (50 lignes) ou ${BUSY}`,
        ),
      },
    },
  },
  "/api/v1/cart/items/{variantId}": {
    put: {
      tags: ["Panier"],
      summary: "Fixer la quantité d'une ligne (la crée si besoin)",
      description: RULES,
      operationId: "setCartItemQuantity",
      security: bearer,
      parameters: [itemParam],
      requestBody: {
        required: true,
        content: { "application/json": { schema: ref("CartQuantityRequest") } },
      },
      responses: {
        "200": json("Cart", "Le panier après la modification"),
        "400": problem("Corps ou UUID invalide"),
        ...common,
        "404": problem("`VARIANTE_INCONNUE`"),
        "409": problem(`\`PRODUIT_INDISPONIBLE\`, \`PANIER_PLEIN\` ou ${BUSY}`),
      },
    },
    delete: {
      tags: ["Panier"],
      summary: "Retirer une ligne (sans effet si elle n'y est pas)",
      description: RULES,
      operationId: "removeCartItem",
      security: bearer,
      parameters: [itemParam],
      responses: {
        "200": json("Cart", "Le panier après le retrait"),
        "400": problem("UUID invalide"),
        ...common,
        "409": problem(BUSY),
      },
    },
  },
  "/api/v1/cart/merge": {
    post: {
      tags: ["Panier"],
      summary: "Réunir le panier du navigateur avec celui du compte, après la connexion",
      description: [
        RULES,
        "Même variante : quantités **additionnées** (bornées au stock et à 20). Rien n'échoue : les lignes indisponibles ou qui ne tiennent plus sont ignorées et comptées dans `ignored`. 10 requêtes par minute et par compte.",
        "**Idempotente** : `mergeId` est tiré par le navigateur et réutilisé s'il renvoie la même réunion (double chargement, réponse perdue) ; une réunion déjà appliquée ne change rien.",
      ].join("\n\n"),
      operationId: "mergeCart",
      security: bearer,
      requestBody: {
        required: true,
        content: { "application/json": { schema: ref("CartMergeRequest") } },
      },
      responses: {
        "200": json("CartMerged", "Le panier réuni"),
        "400": problem(
          "Corps invalide (identifiant de réunion, 50 lignes au plus, quantités de 1 à 20, aucun prix)",
        ),
        ...common,
        "409": problem(BUSY),
      },
    },
  },
} as const;
