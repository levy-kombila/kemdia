/** Description OpenAPI des commandes (S5-T02) ; les schémas viennent de @kemdia/contracts. */

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
const referenceParam = {
  name: "reference",
  in: "path",
  required: true,
  description: "Numéro de commande (« KMD-7F3K9Q »)",
  schema: { type: "string", pattern: "^KMD-[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{6}$" },
};
const RULES =
  "Réservé au **compte connecté** (ses propres commandes ; celle d'un autre compte répond 404). Jamais mis en cache.";

export const orderPaths = {
  "/api/v1/orders/quote": {
    post: {
      tags: ["Commandes"],
      summary: "Total du panier pour une ville de livraison",
      description: [
        RULES,
        "Articles commandables (prix du catalogue), réduction du coupon (`couponCode`, facultatif), frais de livraison (barèmes du contrat, calculés sur les articles après réduction), total, délai, et paiement à la livraison possible ou non (BR-011, valeurs provisoires). Le `total` est à renvoyer dans `expectedTotal`. 30 requêtes par minute et par compte.",
      ].join("\n\n"),
      operationId: "quoteOrder",
      security: bearer,
      requestBody: {
        required: true,
        content: { "application/json": { schema: ref("OrderQuoteRequest") } },
      },
      responses: {
        "200": json("OrderQuote", "Le total"),
        "400": problem("Corps invalide"),
        ...common,
        "409": problem("`COUPON_EPUISE` ou `COUPON_DEJA_UTILISE`"),
        "429": problem("`COUPON_TROP_D_ESSAIS` (10 codes refusés en 15 min) ou `TROP_DE_REQUETES`"),
        "422": problem(
          "`ADRESSE_INVALIDE` (ville inconnue) ou coupon refusé : `COUPON_INVALIDE` (inconnu, désactivé ou pas encore valable), `COUPON_EXPIRE`, `COUPON_MINIMUM_NON_ATTEINT`, `COUPON_NON_APPLICABLE`",
        ),
      },
    },
  },
  "/api/v1/orders": {
    post: {
      tags: ["Commandes"],
      summary: "Commander le panier du compte",
      description: [
        RULES,
        "En **une transaction** : panier verrouillé, stock **réservé** sur chaque variante (BR-012, pas de survente), montants calculés avec les prix lus sur ces variantes (BR-004), total comparé à `expectedTotal`, commande enregistrée, panier vidé. Au moindre refus, rien n'est gardé.",
        "**Idempotente** : la même `idempotencyKey` avec la même demande renvoie la commande déjà créée (200), jamais une deuxième ; avec une demande différente : `CLE_DEJA_UTILISEE`.",
        "Au plus **3 commandes ouvertes** (en attente de paiement, confirmées, en préparation) par compte.",
        "**Coupon** (`couponCode`, un seul) : vérifié et compté dans la même transaction (BR-030), sur les articles seulement ; rendu si la commande est annulée ou n'est pas payée à temps. Refus : erreurs `COUPON_*` (409 / 422).",
        "Mobile Money : statut `pending_payment`, à payer avant `paymentDueAt` (30 min), sinon annulée et stock remis en vente. À la livraison : `confirmed` tout de suite. 10 requêtes par minute et par compte.",
      ].join("\n\n"),
      operationId: "createOrder",
      security: bearer,
      requestBody: {
        required: true,
        content: { "application/json": { schema: ref("CreateOrderRequest") } },
      },
      responses: {
        "201": json("Order", "Commande créée"),
        "200": json("Order", "Commande déjà créée avec cette clé"),
        "400": problem("Corps invalide (aucun article ni prix accepté)"),
        ...common,
        "409": problem(
          "`PANIER_VIDE`, `PANIER_A_VERIFIER` (stock ou produit indisponible), `PRIX_MODIFIE` (le total a changé : relire le total), `CLE_DEJA_UTILISEE` (clé déjà servie pour une autre commande), `TROP_DE_COMMANDES_OUVERTES` (3 commandes non expédiées au plus) ou `PANIER_OCCUPE` (réessayer)",
        ),
        "422": problem(
          "`ADRESSE_INVALIDE`, `NUMERO_PAIEMENT_INVALIDE` (07… Airtel, 06… Moov), `PAIEMENT_A_LA_LIVRAISON_INDISPONIBLE` ou `MOBILE_MONEY_INDISPONIBLE` (aucun fournisseur Mobile Money sur cet environnement : voir `mobileMoney` dans le devis)",
        ),
      },
    },
    get: {
      tags: ["Commandes"],
      summary: "Mes commandes, de la plus récente à la plus ancienne",
      description: `${RULES}\n\nPage suivante : repasser \`nextCursor\` dans \`before\`.`,
      operationId: "listOrders",
      security: bearer,
      parameters: [
        {
          name: "limit",
          in: "query",
          description: "Commandes par page (10 par défaut, 50 au plus)",
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
        "400": problem("Paramètres invalides"),
        ...common,
      },
    },
  },
  "/api/v1/orders/{reference}": {
    get: {
      tags: ["Commandes"],
      summary: "Une commande et son suivi",
      description: RULES,
      operationId: "getOrder",
      security: bearer,
      parameters: [referenceParam],
      responses: {
        "200": json("Order", "La commande"),
        "400": problem("Numéro invalide"),
        ...common,
        "404": problem("`COMMANDE_INTROUVABLE`"),
      },
    },
  },
  "/api/v1/orders/{reference}/cancel": {
    post: {
      tags: ["Commandes"],
      summary: "Annuler sa commande (avant l'expédition)",
      description: [
        RULES,
        "Possible en attente de paiement, et pour le paiement à la livraison jusqu'à la préparation ; le stock est remis en vente dans la même transaction. Mobile Money déjà payée : service client (remboursement, S5-T04/T05). Déjà annulée : renvoyée telle quelle. 10 requêtes par minute et par compte.",
      ].join("\n\n"),
      operationId: "cancelOrder",
      security: bearer,
      parameters: [referenceParam],
      responses: {
        "200": json("Order", "La commande annulée"),
        "400": problem("Numéro invalide"),
        ...common,
        "404": problem("`COMMANDE_INTROUVABLE`"),
        "409": problem(
          "`ANNULATION_IMPOSSIBLE` (déjà expédiée ou livrée — BR-010 —, ou Mobile Money déjà payée) ou `PANIER_OCCUPE`",
        ),
      },
    },
  },
} as const;
