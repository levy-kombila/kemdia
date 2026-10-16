import type { IncomingMessage, ServerResponse } from "node:http";
import { PRODUCT_IMAGE_LIMITS, PRODUCT_IMAGE_TYPES } from "@kemdia/contracts/constants";
import { VersioningType } from "@nestjs/common";
import type {
  NestExpressApplication,
  NestExpressBodyParserOptions,
} from "@nestjs/platform-express";
import helmet from "helmet";
import type { AppConfig } from "../config/env.js";
import { clientMiddleware } from "./client.js";
import { ProblemDetailsFilter } from "./problem-details.filter.js";

/** Taille maximale d'un corps de requête JSON : une API de catalogue et de commande n'a pas besoin de plus. */
export const BODY_LIMIT = "100kb";

/** Adresses des notifications d'opérateurs : leur signature porte sur le corps BRUT, gardé tel quel (S5-T05). */
export const WEBHOOK_PATH_PREFIX = "/api/v1/webhooks/";

/**
 * Envoi d'une photo de produit (S6-T04) : `POST /api/v1/vendors/products/{id}/images`, corps = le fichier lui-même
 * (JPEG, PNG ou WebP, 5 Mo au plus). Lu en binaire SEULEMENT à cette adresse et pour ces types : toutes les autres
 * routes gardent la limite JSON de 100 ko. Le contenu est revérifié par l'API (premiers octets, décodage).
 */
const IMAGE_UPLOAD_PATH = /^\/api\/v1\/vendors\/products\/[^/?#]+\/images\/?(?:\?.*)?$/;
const IMAGE_TYPES: readonly string[] = PRODUCT_IMAGE_TYPES;

export function isImageUpload(req: IncomingMessage): boolean {
  const type = (req.headers["content-type"] ?? "").split(";")[0]!.trim().toLowerCase();
  return (
    req.method === "POST" && IMAGE_UPLOAD_PATH.test(req.url ?? "") && IMAGE_TYPES.includes(type)
  );
}

function keepRawBodyForWebhooks(req: IncomingMessage, _res: ServerResponse, buffer: Buffer): void {
  if (req.url?.startsWith(WEBHOOK_PATH_PREFIX)) {
    (req as IncomingMessage & { rawBody?: Buffer }).rawBody = Buffer.from(buffer);
  }
}

/**
 * Réglages HTTP communs à `main.ts` et aux tests : les tests vérifient donc la vraie configuration.
 *
 * Adresses : `/api/health` (contrôle de santé, sans version) et `/api/v1/…` (routes métier).
 */
export function configureApp(app: NestExpressApplication, config: AppConfig): void {
  app.disable("x-powered-by");
  app.set("trust proxy", config.TRUST_PROXY);

  app.use(
    helmet({
      // Une API ne renvoie que du JSON : rien ne doit pouvoir s'exécuter ni s'afficher dans une page
      contentSecurityPolicy: {
        useDefaults: false,
        directives: { defaultSrc: ["'none'"], frameAncestors: ["'none'"] },
      },
      frameguard: { action: "deny" },
      crossOriginResourcePolicy: { policy: "same-site" },
      strictTransportSecurity: { maxAge: 63_072_000, includeSubDomains: true },
    }),
  );
  // Corps JSON ; pour les notifications d'opérateurs, le corps brut est gardé (signature). `verify` est transmis tel
  // quel à body-parser par Nest, mais absent de son type : d'où la conversion.
  app.useBodyParser("json", {
    limit: BODY_LIMIT,
    verify: keepRawBodyForWebhooks,
  } as NestExpressBodyParserOptions);
  // Photos de produits : corps binaire, à une seule adresse (voir isImageUpload)
  app.useBodyParser("raw", { type: isImageUpload, limit: PRODUCT_IMAGE_LIMITS.maxUploadBytes });
  // Qui appelle : visiteur transmis par le site (clé interne) ou adresse directe (S4-T07)
  app.use(clientMiddleware(config));

  app.enableCors(
    config.CORS_ORIGINS.length
      ? { origin: [...config.CORS_ORIGINS], methods: ["GET", "POST", "PUT", "PATCH", "DELETE"] }
      : { origin: false },
  );

  app.setGlobalPrefix("api");
  app.enableVersioning({ type: VersioningType.URI, defaultVersion: "1" });
  app.useGlobalFilters(new ProblemDetailsFilter());
  // Arrêt propre sur SIGTERM (redéploiement) : les requêtes en cours se terminent, la base est fermée
  app.enableShutdownHooks();
}
