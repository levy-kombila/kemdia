import { describeCatalogSource, resolveCatalogSource, SiteConfigError } from "./catalog-source";

/**
 * Vérification au démarrage du serveur (Node.js uniquement, appelée par src/instrumentation.ts).
 * Configuration fausse — par exemple APP_ENV=production sans API_URL — : message clair, puis arrêt (code 1).
 */
export function checkConfigurationAtStartup(): void {
  try {
    console.log(`Kemdia — catalogue : ${describeCatalogSource(resolveCatalogSource(process.env))}`);
  } catch (error) {
    if (error instanceof SiteConfigError) {
      console.error(error.message);
      process.exit(1);
    }
    throw error;
  }
}
