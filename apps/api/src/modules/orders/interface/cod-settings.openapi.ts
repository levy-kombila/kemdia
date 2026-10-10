/** Description OpenAPI du réglage du paiement à la livraison (S5-T04) ; les schémas viennent de @kemdia/contracts. */

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
  "Paiement à la livraison (BR-011) : proposé dans les **zones** choisies et jusqu'au **total maximum** (livraison comprise). Le devis et la commande appliquent le nouveau réglage aussitôt.",
].join("\n\n");

export const codSettingsPaths = {
  "/api/v1/admin/settings/cod": {
    get: {
      tags: ["Administration"],
      summary: "Réglage du paiement à la livraison",
      description: RULES,
      operationId: "getCodSettings",
      security: bearer,
      responses: { "200": json("CodSettings", "Le réglage en vigueur"), ...common },
    },
    put: {
      tags: ["Administration"],
      summary: "Changer le réglage du paiement à la livraison",
      description: RULES,
      operationId: "updateCodSettings",
      security: bearer,
      requestBody: {
        required: true,
        content: { "application/json": { schema: ref("CodSettingsRequest") } },
      },
      responses: {
        "200": json("CodSettings", "Le nouveau réglage"),
        "400": problem("Corps invalide (zone inconnue, montant hors bornes)"),
        ...common,
      },
    },
  },
} as const;
