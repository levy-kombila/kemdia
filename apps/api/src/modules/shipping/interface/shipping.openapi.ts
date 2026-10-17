/** Description OpenAPI des livraisons (S7-T01, ADR-0040) ; les schémas viennent de @kemdia/contracts. */

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
const common = {
  "401": problem("`SESSION_INVALIDE` : jeton absent, inconnu, expiré ou fermé"),
  "403": problem(
    "`ACCES_REFUSE` (rôle administrateur requis) ou `DEUX_FACTEURS_A_ACTIVER` / `DEUX_FACTEURS_REQUIS` (double authentification à activer, ou à confirmer depuis 15 minutes)",
  ),
  "429": problem("Trop de requêtes par minute, par adresse ou par compte (`TROP_DE_REQUETES`)"),
};
const ADMIN = [
  "Réservé aux **administrateurs**, avec une session **confirmée par la double authentification** il y a moins de 15 minutes. Chaque étape est inscrite au journal d'audit.",
  "Transporteur **« manuel »** tant qu'aucun n'est choisi : l'équipe note chaque étape. Répéter une action déjà faite ne change rien.",
].join("\n\n");
const action = (
  operationId: string,
  summary: string,
  details: string,
  body?: string,
  extra: Record<string, unknown> = {},
) => ({
  post: {
    tags: ["Livraisons"],
    summary,
    description: `${ADMIN}\n\n${details}`,
    operationId,
    security: bearer,
    parameters: [reference],
    ...(body
      ? { requestBody: { required: true, content: { "application/json": { schema: ref(body) } } } }
      : {}),
    responses: {
      "200": json("Shipment", "L'expédition"),
      ...(body ? { "400": problem("Corps invalide") } : {}),
      "404": problem("`COMMANDE_INTROUVABLE` ou `EXPEDITION_INTROUVABLE`"),
      "409": problem(
        "`STATUT_EXPEDITION_INCOMPATIBLE`, `EXPEDITION_IMPOSSIBLE` ou `PANIER_OCCUPE` (commande occupée : réessayer)",
      ),
      ...extra,
      ...common,
    },
  },
});

export const shippingPaths = {
  "/api/v1/shipping/tariffs": {
    get: {
      tags: ["Livraisons"],
      summary: "Barème de livraison en vigueur",
      description:
        "Frais de base, seuil de livraison offerte et délais des 4 zones. Les suppléments par ville sont dans le contrat (`@kemdia/contracts/delivery`).",
      operationId: "getDeliveryTariffs",
      responses: { "200": json("DeliveryTariffs", "Le barème") },
    },
  },
  "/api/v1/admin/shipping/tariffs": {
    get: {
      tags: ["Livraisons"],
      summary: "Barème de livraison (administration)",
      description: ADMIN,
      operationId: "getAdminDeliveryTariffs",
      security: bearer,
      responses: { "200": json("DeliveryTariffs", "Le barème"), ...common },
    },
    put: {
      tags: ["Livraisons"],
      summary: "Changer le barème de livraison",
      description: `${ADMIN}\n\nLes 4 zones, une fois chacune. Le devis et la commande appliquent le nouveau barème aussitôt.`,
      operationId: "updateDeliveryTariffs",
      security: bearer,
      requestBody: {
        required: true,
        content: { "application/json": { schema: ref("DeliveryTariffsRequest") } },
      },
      responses: {
        "200": json("DeliveryTariffs", "Le nouveau barème"),
        "400": problem("Corps invalide"),
        "422": problem("`TARIFS_INVALIDES` : zone en double, montant ou délai hors bornes"),
        ...common,
      },
    },
  },
  "/api/v1/admin/shipping/ready": {
    get: {
      tags: ["Livraisons"],
      summary: "Commandes prêtes à remettre au transporteur",
      description: `${ADMIN}\n\nConfirmées ou en préparation, tous les vendeurs d'accord (BR-013), les plus anciennes d'abord (100 au plus).`,
      operationId: "listReadyOrders",
      security: bearer,
      responses: { "200": json("ReadyOrderList", "Les commandes prêtes"), ...common },
    },
  },
  "/api/v1/admin/shipping/shipments": {
    get: {
      tags: ["Livraisons"],
      summary: "Expéditions par statut",
      description: `${ADMIN}\n\nLes plus récemment changées d'abord (100 au plus).`,
      operationId: "listShipments",
      security: bearer,
      parameters: [
        {
          name: "status",
          in: "query",
          required: true,
          schema: { type: "string", enum: ["in_transit", "delivered", "failed", "cancelled"] },
        },
      ],
      responses: {
        "200": json("ShipmentList", "Les expéditions"),
        "400": problem("Statut inconnu"),
        ...common,
      },
    },
  },
  "/api/v1/admin/shipping/shipments/{reference}": {
    get: {
      tags: ["Livraisons"],
      summary: "Expédition d'une commande",
      description: ADMIN,
      operationId: "getShipment",
      security: bearer,
      parameters: [reference],
      responses: {
        "200": json("Shipment", "L'expédition et son historique"),
        "404": problem("`EXPEDITION_INTROUVABLE`"),
        ...common,
      },
    },
  },
  "/api/v1/admin/shipping/shipments/{reference}/hand-over": action(
    "handOverShipment",
    "Remettre la commande au transporteur",
    "La commande passe **expédiée** ; l'expédition naît **en route** avec la part de Kemdia (15 % des frais, entier inférieur — BR-021) et celle du transporteur.",
  ),
  "/api/v1/admin/shipping/shipments/{reference}/delivered": action(
    "markShipmentDelivered",
    "Noter la commande livrée",
    "Depuis **en route** seulement. Une commande livrée n'est plus annulable (BR-010).",
  ),
  "/api/v1/admin/shipping/shipments/{reference}/failed": action(
    "markShipmentFailed",
    "Noter un échec de livraison",
    "Depuis **en route** ; motif obligatoire. Ensuite : nouvelle tentative ou annulation.",
    "ShipmentFailedRequest",
    { "422": problem("`EXPEDITION_INVALIDE` : motif trop court ou trop long") },
  ),
  "/api/v1/admin/shipping/shipments/{reference}/retry": action(
    "retryShipment",
    "Nouvelle tentative de livraison",
    "Depuis **échec** ; l'expédition repart **en route** (20 tentatives au plus).",
  ),
  "/api/v1/admin/shipping/shipments/{reference}/cancel": action(
    "cancelShipment",
    "Annuler la commande après un échec de livraison",
    "Depuis **échec** ; note obligatoire. La commande est annulée : stock et coupon rendus, remboursement « à faire » d'un paiement Mobile Money, avoir si elle était facturée. Refusé si les espèces ont été encaissées.",
    "ShipmentCancelRequest",
    { "422": problem("`EXPEDITION_INVALIDE` : note trop courte ou trop longue") },
  ),
} as const;
