/** Description OpenAPI de l'administration des coupons (S5-T03) ; les schémas viennent de @kemdia/contracts. */

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
  "Réservé aux **administrateurs**, avec une session ouverte il y a **moins de 15 minutes**. Chaque changement est inscrit au journal d'audit.",
  "Un coupon : pourcentage (1 à 90 %, plafond possible) ou montant fixe, **sur les articles seulement** ; par défaut une fois par compte et pas sur les articles déjà en promotion (BR-031). Ses règles ne changent plus une fois créé.",
].join("\n\n");

export const couponPaths = {
  "/api/v1/admin/coupons": {
    post: {
      tags: ["Administration"],
      summary: "Créer un coupon",
      description: RULES,
      operationId: "createCoupon",
      security: bearer,
      requestBody: {
        required: true,
        content: { "application/json": { schema: ref("CouponCreateRequest") } },
      },
      responses: {
        "201": json("Coupon", "Le coupon créé"),
        "400": problem("Corps invalide"),
        ...common,
        "409": problem("`COUPON_EXISTE` : un coupon porte déjà ce code"),
        "422": problem("Règle non respectée (pourcentage, plafond, dates, limites)"),
      },
    },
    get: {
      tags: ["Administration"],
      summary: "Coupons, du plus récent au plus ancien",
      description: `${RULES}\n\nPage suivante : repasser \`nextCursor\` dans \`before\`.`,
      operationId: "listCoupons",
      security: bearer,
      parameters: [
        {
          name: "limit",
          in: "query",
          description: "Coupons par page (50 par défaut, 100 au plus)",
          schema: { type: "integer", minimum: 1, maximum: 100, default: 50 },
        },
        {
          name: "before",
          in: "query",
          description: "Position renvoyée par la page précédente (`nextCursor`)",
          schema: { type: "string" },
        },
      ],
      responses: {
        "200": json("CouponPage", "Une page de coupons"),
        "400": problem("Paramètres invalides"),
        ...common,
      },
    },
  },
  "/api/v1/admin/coupons/{couponId}": {
    patch: {
      tags: ["Administration"],
      summary: "Activer ou désactiver un coupon",
      description: RULES,
      operationId: "updateCoupon",
      security: bearer,
      parameters: [
        {
          name: "couponId",
          in: "path",
          required: true,
          description: "UUID du coupon",
          schema: { type: "string", format: "uuid" },
        },
      ],
      requestBody: {
        required: true,
        content: { "application/json": { schema: ref("CouponUpdateRequest") } },
      },
      responses: {
        "200": json("Coupon", "Le coupon"),
        "400": problem("Corps ou UUID invalide"),
        ...common,
        "404": problem("`COUPON_INTROUVABLE`"),
      },
    },
  },
} as const;
