import type { CatalogSource } from "./catalog-source";
import { log as serverLog } from "@/lib/log";

/**
 * Démo Render gratuite (S3-T07) : le site ET l'API s'endorment après 15 min sans visite.
 * Quand un visiteur réveille le site, l'API dort encore : le site la réveille aussitôt, au démarrage,
 * sans attendre la première page. On gagne le temps de démarrage du site sur celui de l'API.
 *
 * Seulement avec `APP_ENV=demo`. Ne bloque jamais le démarrage :
 * la requête part en arrière-plan, et un échec est simplement noté dans le journal.
 * `/api/health` est public : aucune clé n'est envoyée.
 */
export const WAKE_TIMEOUT_MS = 90_000;

type Fetch = (url: string, init: RequestInit) => Promise<Response>;

/** Pause entre deux essais quand Render répond 502/503/504 pendant le démarrage de l'API (S4-T08). */
export const WAKE_RETRY_MS = 3_000;
const GATEWAY_STATUSES = new Set([502, 503, 504]);

export async function wakeCatalogApi(
  appEnv: string | undefined,
  source: CatalogSource,
  options: {
    fetch?: Fetch;
    log?: (message: string) => void;
    now?: () => number;
    sleep?: (ms: number) => Promise<void>;
  } = {},
): Promise<"skipped" | "awake" | "failed"> {
  if (appEnv !== "demo") return "skipped";
  const {
    fetch: fetchImpl = fetch,
    log = (message: string) => serverLog.info("démarrage", message),
    now = Date.now,
    sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms)),
  } = options;
  const started = now();
  const deadline = started + WAKE_TIMEOUT_MS;
  const elapsed = () => ((now() - started) / 1000).toFixed(1);
  try {
    for (;;) {
      const response = await fetchImpl(`${source.url}/api/health`, {
        signal: AbortSignal.timeout(Math.max(1, deadline - now())),
        cache: "no-store",
      });
      // Corps jamais lu : libéré tout de suite (connexion rendue)
      await response.body?.cancel().catch(() => undefined);
      if (response.ok) {
        log(`Kemdia — réveil de l'API : prête en ${elapsed()} s`);
        return "awake";
      }
      // Render répond 502 tant que l'API démarre (constaté sur la démo le 2026-10-09) : on patiente
      if (!GATEWAY_STATUSES.has(response.status) || now() + WAKE_RETRY_MS >= deadline) {
        log(`Kemdia — réveil de l'API : réponse ${response.status} après ${elapsed()} s`);
        return "failed";
      }
      await sleep(WAKE_RETRY_MS);
    }
  } catch {
    log("Kemdia — réveil de l'API : pas de réponse (le premier affichage peut échouer)");
    return "failed";
  }
}
