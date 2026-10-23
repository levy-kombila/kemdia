import type { IncomingMessage, ServerResponse } from "node:http";
import {
  CATALOG_IMPORT_LIMITS,
  PRODUCT_IMAGE_LIMITS,
  PRODUCT_IMAGE_TYPES,
  SESSION_TOKEN_PATTERN,
} from "@kemdia/contracts/constants";
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
// Photos des produits (S6-T04), pièces du dossier de vérification (S6-T08) et photo de profil (S7.5-T08)
const IMAGE_UPLOAD_PATH =
  /^\/api\/v1\/(?:vendors\/(?:products\/[^/?#]+\/images|kyc\/documents\/[a-z_]{2,10})|auth\/avatar)\/?(?:\?.*)?$/;
const IMAGE_TYPES: readonly string[] = PRODUCT_IMAGE_TYPES;

const hasSessionToken = (header: string | undefined): boolean =>
  !!header && header.startsWith("Bearer ") && SESSION_TOKEN_PATTERN.test(header.slice(7));

/**
 * Import du catalogue par l'équipe (S8-T03) : `POST /api/v1/admin/catalog-import` ou `…/check`, corps = le fichier CSV
 * (texte UTF-8, 2 Mo au plus). Lu en texte SEULEMENT à cette adresse et pour ce type ; la route revérifie tout.
 */
const CATALOG_IMPORT_PATH = /^\/api\/v1\/admin\/catalog-import(?:\/check)?\/?(?:\?.*)?$/;

export function isCatalogImport(req: IncomingMessage): boolean {
  const type = (req.headers["content-type"] ?? "").split(";")[0]!.trim().toLowerCase();
  return (
    req.method === "POST" &&
    CATALOG_IMPORT_PATH.test(req.url ?? "") &&
    type === "text/csv" &&
    hasSessionToken(req.headers.authorization)
  );
}

export function isImageUpload(req: IncomingMessage): boolean {
  const type = (req.headers["content-type"] ?? "").split(";")[0]!.trim().toLowerCase();
  return (
    req.method === "POST" &&
    IMAGE_UPLOAD_PATH.test(req.url ?? "") &&
    IMAGE_TYPES.includes(type) &&
    // Sans jeton de session bien formé, la route refusera (401) : inutile de lire 5 Mo pour rien
    hasSessionToken(req.headers.authorization)
  );
}

/** Envois de photos traités en même temps au plus, pour toute l'API (lecture du corps comprise). */
export const MAX_CONCURRENT_UPLOADS = 6;

/**
 * Le corps d'une photo (5 Mo) est lu AVANT les contrôles de la route (session, limites) : on borne donc le nombre
 * d'envois en cours. Au-delà : 503 et « réessayez dans quelques secondes », sans lire le fichier (relecture S6-T04).
 */
export function limitConcurrentUploads(max = MAX_CONCURRENT_UPLOADS) {
  let active = 0;
  return (req: IncomingMessage, res: ServerResponse, next: () => void): void => {
    if (!isImageUpload(req)) return next();
    if (active >= max) {
      res.statusCode = 503;
      res.setHeader("Retry-After", "5");
      res.setHeader("Content-Type", "application/problem+json");
      res.setHeader("Connection", "close");
      res.end(
        JSON.stringify({
          type: "about:blank",
          title: "Service indisponible",
          status: 503,
          detail: "Trop d'envois de photos en même temps : réessayez dans quelques secondes",
        }),
      );
      return;
    }
    active += 1;
    res.once("close", () => {
      active -= 1;
    });
    next();
  };
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
  // Photos : nombre d'envois en cours borné AVANT la lecture de leur corps
  app.use(limitConcurrentUploads());
  // Corps JSON ; pour les notifications d'opérateurs, le corps brut est gardé (signature). `verify` est transmis tel
  // quel à body-parser par Nest, mais absent de son type : d'où la conversion.
  app.useBodyParser("json", {
    limit: BODY_LIMIT,
    verify: keepRawBodyForWebhooks,
  } as NestExpressBodyParserOptions);
  // Photos de produits : corps binaire, à une seule adresse (voir isImageUpload)
  app.useBodyParser("raw", { type: isImageUpload, limit: PRODUCT_IMAGE_LIMITS.maxUploadBytes });
  // Fichier du catalogue (S8-T03) : texte, à deux adresses seulement (voir isCatalogImport)
  app.useBodyParser("text", {
    type: isCatalogImport,
    limit: CATALOG_IMPORT_LIMITS.maxBytes,
    defaultCharset: "utf-8",
  });
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
