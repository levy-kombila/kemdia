/**
 * Santé « complète » du site (S7-T06, ADR-0045) : `GET /api/health?complet=1`.
 *
 * La sonde externe (UptimeRobot) appelle cette adresse : elle passe par Caddy, le site, l'API et PostgreSQL, et voit
 * donc une panne de l'API ou de la base même quand le site, lui, répond. Le `/api/health` simple reste inchangé (Docker,
 * test de fumée) : le site ne doit pas être déclaré malade parce que l'API l'est.
 *
 * Résultat gardé 10 s : appeler cette adresse en boucle ne peut pas charger l'API ni la base (une seule requête à la
 * fois, quel que soit le nombre d'appels). Seul `/api/health` de l'API est appelé (public, sans clé).
 */
export type ComponentStatus = "ok" | "indisponible";

export interface DeepHealth {
  status: "ok" | "degrade";
  checks: { api: ComponentStatus; database: ComponentStatus | "inconnue" };
}

export interface DeepHealthOptions {
  url: string;
  fetch?: typeof fetch;
  now?: () => number;
  timeoutMs?: number;
  cacheMs?: number;
}

export function createDeepHealth(options: DeepHealthOptions): () => Promise<DeepHealth> {
  const doFetch = options.fetch ?? fetch;
  const now = options.now ?? Date.now;
  const timeoutMs = options.timeoutMs ?? 3_000;
  const cacheMs = options.cacheMs ?? 10_000;
  let cached: { expires: number; value: DeepHealth } | undefined;
  let inflight: Promise<DeepHealth> | undefined;

  async function probe(): Promise<DeepHealth> {
    try {
      const response = await doFetch(`${options.url}/api/health`, {
        cache: "no-store",
        signal: AbortSignal.timeout(timeoutMs),
      });
      const body = (await response.json().catch(() => undefined)) as
        { checks?: { database?: unknown } } | undefined;
      const database: ComponentStatus | "inconnue" =
        body?.checks?.database === "ok"
          ? "ok"
          : body?.checks?.database === "indisponible"
            ? "indisponible"
            : "inconnue";
      // L'API répond (200 sain, 503 base indisponible) : elle tourne ; tout autre statut = API en panne
      const api: ComponentStatus =
        response.status === 200 || response.status === 503 ? "ok" : "indisponible";
      const healthy = response.status === 200 && database === "ok";
      return { status: healthy ? "ok" : "degrade", checks: { api, database } };
    } catch {
      return { status: "degrade", checks: { api: "indisponible", database: "inconnue" } };
    }
  }

  return () => {
    if (cached && cached.expires > now()) return Promise.resolve(cached.value);
    inflight ??= probe()
      .then((value) => {
        cached = { expires: now() + cacheMs, value };
        return value;
      })
      .finally(() => {
        inflight = undefined;
      });
    return inflight;
  };
}
