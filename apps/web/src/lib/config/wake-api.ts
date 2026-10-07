import type { CatalogSource } from "./catalog-source";

/**
 * Démo Render gratuite (S3-T07) : le site ET l'API s'endorment après 15 min sans visite.
 * Quand un visiteur réveille le site, l'API dort encore : le site la réveille aussitôt, au démarrage,
 * sans attendre la première page. On gagne le temps de démarrage du site sur celui de l'API.
 *
 * Seulement avec `APP_ENV=demo` et un catalogue lu dans l'API. Ne bloque jamais le démarrage :
 * la requête part en arrière-plan, et un échec est simplement noté dans le journal.
 * `/api/health` est public : aucune clé n'est envoyée.
 */
export const WAKE_TIMEOUT_MS = 90_000;

type Fetch = (url: string, init: RequestInit) => Promise<Response>;

export async function wakeCatalogApi(
  appEnv: string | undefined,
  source: CatalogSource,
  options: { fetch?: Fetch; log?: (message: string) => void } = {},
): Promise<"skipped" | "awake" | "failed"> {
  if (appEnv !== "demo" || source.kind !== "api") return "skipped";
  const { fetch: fetchImpl = fetch, log = console.log } = options;
  const started = Date.now();
  try {
    const response = await fetchImpl(`${source.url}/api/health`, {
      signal: AbortSignal.timeout(WAKE_TIMEOUT_MS),
      cache: "no-store",
    });
    const seconds = ((Date.now() - started) / 1000).toFixed(1);
    if (!response.ok) {
      log(`Kemdia — réveil de l'API : réponse ${response.status} après ${seconds} s`);
      return "failed";
    }
    log(`Kemdia — réveil de l'API : prête en ${seconds} s`);
    return "awake";
  } catch {
    log("Kemdia — réveil de l'API : pas de réponse (le premier affichage peut échouer)");
    return "failed";
  }
}
