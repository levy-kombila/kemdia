import { describeCatalogSource, resolveCatalogSource, SiteConfigError } from "./catalog-source";
import { wakeCatalogApi } from "./wake-api";

/**
 * Vérification au démarrage du serveur (Node.js uniquement, appelée par src/instrumentation.ts).
 * Configuration fausse — par exemple APP_ENV=production sans API_URL — : message clair, puis arrêt (code 1).
 * Sur la démo Render, réveille aussi l'API en arrière-plan (S3-T07, voir wake-api.ts).
 */
export function checkConfigurationAtStartup(): void {
  try {
    const source = resolveCatalogSource(process.env);
    console.log(`Kemdia — catalogue : ${describeCatalogSource(source)}`);
    void wakeCatalogApi(process.env.APP_ENV, source);
  } catch (error) {
    if (error instanceof SiteConfigError) {
      console.error(error.message);
      process.exit(1);
    }
    throw error;
  }
}
