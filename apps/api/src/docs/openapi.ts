import { openApiComponentSchemas } from "@kemdia/contracts";
import { catalogPaths } from "../modules/catalog/interface/catalog.openapi.js";
import { adminPaths } from "../modules/identity/interface/admin.openapi.js";
import { cartPaths } from "../modules/orders/interface/cart.openapi.js";
import { codSettingsPaths } from "../modules/orders/interface/cod-settings.openapi.js";
import { couponPaths } from "../modules/orders/interface/coupon.openapi.js";
import { paymentPaths } from "../modules/payments/interface/payments.openapi.js";
import { orderPaths } from "../modules/orders/interface/order.openapi.js";
import { identityPaths } from "../modules/identity/interface/identity.openapi.js";
import { vendorsPaths } from "../modules/vendors/interface/vendors.openapi.js";

/** Version du contrat HTTP (indépendante de la version de l'image) : à augmenter à chaque changement de l'API. */
export const API_CONTRACT_VERSION = "1.14.0";

/** Document OpenAPI complet de l'API, généré à partir des schémas réellement utilisés. */
export function buildOpenApiDocument(): Record<string, unknown> {
  return {
    openapi: "3.1.0",
    info: {
      title: "API Kemdia",
      version: API_CONTRACT_VERSION,
      description: [
        "API de la plateforme e-commerce Kemdia (Gabon). Montants en FCFA entiers (BR-004), identifiants UUID (BR-042).",
        "",
        "- Erreurs : format Problem Details (RFC 9457), message en français, identifiant de requête.",
        "- Limitation de débit : par adresse IP et par minute ; en cas de dépassement, 429 et en-tête `Retry-After`.",
        "- Cache : les lectures du catalogue peuvent être gardées 60 s (`Cache-Control`).",
        "- Erreurs métier : champ `code` stable (ex. `CODE_INVALIDE`), à utiliser plutôt que le texte du message.",
        "- Rôles (S4-T06) : `client`, `vendor`, `moderator`, `admin`, cumulables ; voir le tag Administration.",
        "- Limites par compte (S4-T07) : sur chaque route connectée (120/min par défaut), 429 `TROP_DE_REQUETES` + `Retry-After`.",
        "- Le serveur du site transmet l'adresse du visiteur (`X-Kemdia-Client-IP`), crue seulement avec sa clé interne.",
        "- Panier (S5-T01) : un panier par compte connecté, revérifié dans le catalogue à chaque réponse ; jamais de prix reçu du site.",
        "- Commandes (S5-T02) : créées depuis le panier du compte, stock réservé dans la même transaction, idempotentes (`idempotencyKey`).",
        "- Coupons (S5-T03) : un par commande, sur les articles seulement, utilisation comptée avec la commande et rendue si elle est annulée.",
        "- Paiements (S5-T04) : Mobile Money en 3 essais au plus ; paiement à la livraison réglé par l'administrateur ; remboursements suivis à la main.",
        "- Factures (S5-T06) : établies au paiement reçu, avoir à l'annulation, numéros par année sans trou, PDF et e-mail.",
        "- Notifications de l'opérateur (S5-T05) : signées (HMAC-SHA256, 5 minutes), rejeu ignoré ; bac à sable avec téléphone simulé en local et en démo.",
        "- Boutiques (S6-T01) : un client demande à ouvrir sa boutique ; un administrateur la valide (rôle vendeur accordé), la refuse ou la suspend.",
      ].join("\n"),
    },
    servers: [{ url: "/", description: "Même adresse que cette documentation" }],
    tags: [
      {
        name: "Catalogue",
        description: "Catégories, produits, variantes, disponibilité (module catalog)",
      },
      {
        name: "Identité",
        description:
          "Inscription et vérification par code (module identity) ; appelées par le serveur du site",
      },
      {
        name: "Administration",
        description:
          "Rôles des comptes et journal d'audit (S4-T06) : administrateurs connectés depuis moins de 15 minutes",
      },
      {
        name: "Panier",
        description:
          "Panier serveur du compte connecté (module orders, S5-T01) ; appelé par le serveur du site",
      },
      {
        name: "Commandes",
        description:
          "Commandes du compte connecté (module orders, S5-T02) : stock réservé dans la même transaction (BR-012)",
      },
      {
        name: "Paiements",
        description:
          "Paiement Mobile Money d'une commande du compte connecté (module payments, S5-T04)",
      },
      {
        name: "Bac à sable",
        description:
          "Téléphone simulé de l'opérateur Mobile Money (S5-T05) : poste de développement et démo seulement",
      },
      {
        name: "Boutiques",
        description:
          "Boutiques des vendeurs (module vendors, S6-T01) : demande du compte connecté, examen par l'administration",
      },
      { name: "Supervision", description: "État du service" },
    ],
    paths: {
      "/api/health": {
        get: {
          tags: ["Supervision"],
          summary: "État de l'API et de la base de données",
          operationId: "health",
          responses: {
            "200": {
              description: "Tout fonctionne",
              content: { "application/json": { schema: { $ref: "#/components/schemas/Health" } } },
            },
            "503": {
              description: "Base de données indisponible",
              content: { "application/json": { schema: { $ref: "#/components/schemas/Health" } } },
            },
          },
        },
      },
      ...catalogPaths,
      ...identityPaths,
      ...adminPaths,
      ...cartPaths,
      ...orderPaths,
      ...couponPaths,
      ...codSettingsPaths,
      ...paymentPaths,
      ...vendorsPaths,
    },
    // Schémas du contrat partagé avec le site (@kemdia/contracts)
    components: {
      schemas: openApiComponentSchemas(),
      securitySchemes: {
        session: {
          type: "http",
          scheme: "bearer",
          description:
            "Jeton de session (43 caractères) reçu à la connexion ; envoyé par le serveur du site",
        },
      },
    },
  };
}
