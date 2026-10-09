import { VersioningType } from "@nestjs/common";
import type { NestExpressApplication } from "@nestjs/platform-express";
import helmet from "helmet";
import type { AppConfig } from "../config/env.js";
import { clientMiddleware } from "./client.js";
import { ProblemDetailsFilter } from "./problem-details.filter.js";

/** Taille maximale d'un corps de requête JSON : une API de catalogue et de commande n'a pas besoin de plus. */
export const BODY_LIMIT = "100kb";

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
  app.useBodyParser("json", { limit: BODY_LIMIT });
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
