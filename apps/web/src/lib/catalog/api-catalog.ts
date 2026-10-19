import "server-only";
import {
  CategoryTreeSchema,
  CategoryViewSchema,
  FacetsSchema,
  INTERNAL_KEY_HEADER,
  ProductDetailSchema,
  ProductPageSchema,
  SLUG_PATTERN,
  productQueryParams,
} from "@kemdia/contracts";
import type { z } from "zod";
import { CatalogUnavailableError, type CatalogPort } from "./port";
import { log } from "@/lib/log";

/** Durée de conservation d'une réponse : celle annoncée par l'API (Cache-Control: max-age=60). */
export const CACHE_TTL_MS = 60_000;
const MAX_CACHE_ENTRIES = 500;

export interface ApiCatalogOptions {
  url: string;
  key: string;
  timeoutMs: number;
  fetch?: typeof fetch;
  now?: () => number;
  /**
   * Démo seulement (S4-T08) : pendant son réveil, Render répond 502/503/504 au lieu d'attendre. On réessaie alors
   * toutes les {@link GATEWAY_RETRY_MS} jusqu'à `timeoutMs`, au lieu d'afficher tout de suite la page d'erreur.
   * Désactivé ailleurs : une vraie panne doit se voir sans attendre.
   */
  retryGatewayErrors?: boolean;
  /** Attente entre deux essais (remplacée dans les tests) */
  sleep?: (ms: number) => Promise<void>;
}

/** Pause entre deux essais quand l'API se réveille (démo). */
export const GATEWAY_RETRY_MS = 3_000;
const GATEWAY_STATUSES = new Set([502, 503, 504]);

/**
 * Adaptateur « API » : lit le catalogue sur `/api/v1`, depuis le serveur du site uniquement
 * (la clé interne ne quitte jamais le serveur ; `server-only` empêche ce fichier d'aller dans le navigateur).
 *
 * - Chaque réponse est vérifiée par le schéma du contrat partagé : une API qui renverrait autre chose est refusée.
 * - Réponses gardées 60 s en mémoire ; requêtes identiques simultanées regroupées en une seule.
 * - Erreur, délai dépassé, réponse non conforme : `CatalogUnavailableError` → page d'erreur.
 *   AUCUNE bascule sur le fichier de démonstration (décision S3-T05).
 */
export function createApiCatalog(options: ApiCatalogOptions): CatalogPort {
  const doFetch = options.fetch ?? fetch;
  const now = options.now ?? Date.now;
  const cache = new Map<string, { expires: number; value: unknown }>();
  const inflight = new Map<string, Promise<unknown>>();

  const sleep = options.sleep ?? ((ms: number) => new Promise((r) => setTimeout(r, ms)));

  async function load<T>(path: string, schema: z.ZodType<T>): Promise<T | null> {
    const url = `${options.url}/api/v1${path}`;
    // Délai TOTAL, essais compris : le visiteur n'attend jamais plus que `timeoutMs`
    const deadline = now() + options.timeoutMs;
    let response: Response;
    for (;;) {
      try {
        response = await doFetch(url, {
          headers: { accept: "application/json", [INTERNAL_KEY_HEADER]: options.key },
          // Pas de cache de Next.js : le nôtre suffit et se comporte pareil partout
          cache: "no-store",
          signal: AbortSignal.timeout(Math.max(1, deadline - now())),
        });
      } catch (error) {
        const timeout = error instanceof DOMException && error.name === "TimeoutError";
        log.error("catalogue", `${path} : ${timeout ? "délai dépassé" : "API injoignable"}`);
        throw new CatalogUnavailableError(timeout ? "délai dépassé" : "API injoignable");
      }
      const retry =
        options.retryGatewayErrors &&
        GATEWAY_STATUSES.has(response.status) &&
        now() + GATEWAY_RETRY_MS < deadline;
      if (!retry) break;
      await response.body?.cancel().catch(() => undefined);
      await sleep(GATEWAY_RETRY_MS);
    }
    if (response.status === 404) return null;
    if (!response.ok) {
      log.error("catalogue", `${path} : statut ${response.status}`);
      throw new CatalogUnavailableError(`statut ${response.status}`);
    }
    const parsed = schema.safeParse(await response.json().catch(() => undefined));
    if (!parsed.success) {
      // Chemins des champs seulement : jamais les valeurs reçues dans le journal
      const fields = parsed.error.issues.map((i) => i.path.join(".") || "(racine)").slice(0, 5);
      log.error("catalogue", `${path} : réponse non conforme au contrat (${fields.join(", ")})`);
      throw new CatalogUnavailableError("réponse non conforme au contrat");
    }
    return parsed.data;
  }

  function get<T>(path: string, schema: z.ZodType<T>): Promise<T | null> {
    const hit = cache.get(path);
    if (hit && hit.expires > now()) return Promise.resolve(hit.value as T | null);
    const pending = inflight.get(path);
    if (pending) return pending as Promise<T | null>;
    const request = load(path, schema)
      .then((value) => {
        if (cache.size >= MAX_CACHE_ENTRIES) cache.delete(cache.keys().next().value as string);
        cache.set(path, { expires: now() + CACHE_TTL_MS, value });
        return value;
      })
      .finally(() => inflight.delete(path));
    inflight.set(path, request);
    return request;
  }

  async function required<T>(path: string, schema: z.ZodType<T>): Promise<T> {
    const value = await get(path, schema);
    if (value === null) throw new CatalogUnavailableError(`${path} introuvable`);
    return value;
  }

  const withQuery = (path: string, params: URLSearchParams) =>
    params.size ? `${path}?${params.toString()}` : path;

  return {
    async categoryTree() {
      return (await required("/categories", CategoryTreeSchema)).items;
    },
    category(slug) {
      // Adresse validée avant de la mettre dans l'URL de l'API
      if (!SLUG_PATTERN.test(slug) || slug.length > 120) return Promise.resolve(null);
      return get(`/categories/${slug}`, CategoryViewSchema);
    },
    products(query) {
      return required(withQuery("/products", productQueryParams(query)), ProductPageSchema);
    },
    facets(query) {
      return required(withQuery("/products/facets", productQueryParams(query)), FacetsSchema);
    },
    product(slug) {
      if (!SLUG_PATTERN.test(slug) || slug.length > 120) return Promise.resolve(null);
      return get(`/products/${slug}`, ProductDetailSchema);
    },
  };
}
