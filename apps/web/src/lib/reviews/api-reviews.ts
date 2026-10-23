import "server-only";
import {
  CLIENT_IP_HEADER,
  INTERNAL_KEY_HEADER,
  MyReviewSchema,
  OwnReviewSchema,
  ProblemDetailsSchema,
  REVIEW_ERROR_CODES,
  ReviewPageSchema,
  SESSION_TOKEN_PATTERN,
  SLUG_PATTERN,
  type MyReview,
  type OwnReview,
  type ReviewErrorCode,
  type ReviewPage,
} from "@kemdia/contracts";
import type { z } from "zod";
import { log } from "@/lib/log";

/**
 * Avis des clients (S8-T01, ADR-0056) côté serveur du site : avis publiés d'une fiche (gardés 60 s, comme le
 * catalogue), mon avis, donner / modifier / retirer mon avis (session du visiteur, jamais gardés).
 */
export type ReviewFailureCode =
  | ReviewErrorCode
  | "PRODUIT_INTROUVABLE"
  | "SESSION_INVALIDE"
  | "TROP_DE_REQUETES"
  | "INDISPONIBLE";
export type ReviewResult<T> = { ok: true; data: T } | { ok: false; code: ReviewFailureCode };

export interface ReviewsApiOptions {
  url: string;
  key: string;
  timeoutMs: number;
  fetch?: typeof fetch;
  now?: () => number;
  visitorIp?: () => Promise<string | null>;
}

const KNOWN: readonly ReviewFailureCode[] = [
  ...REVIEW_ERROR_CODES,
  "PRODUIT_INTROUVABLE",
  "SESSION_INVALIDE",
  "TROP_DE_REQUETES",
];
const CACHE_MS = 60_000;
const MAX_CACHE = 500;

export function createReviewsApi(options: ReviewsApiOptions) {
  const doFetch = options.fetch ?? fetch;
  const now = options.now ?? Date.now;
  const cache = new Map<string, { expires: number; value: ReviewPage }>();

  async function call<T>(
    method: "GET" | "PUT" | "DELETE",
    path: string,
    schema: z.ZodType<T> | null,
    { token, body }: { token?: string; body?: object } = {},
  ): Promise<ReviewResult<T>> {
    const headers: Record<string, string> = {
      accept: "application/json",
      [INTERNAL_KEY_HEADER]: options.key,
    };
    if (token) headers.authorization = `Bearer ${token}`;
    if (body) headers["content-type"] = "application/json";
    const ip = options.visitorIp ? await options.visitorIp().catch(() => null) : null;
    if (ip) headers[CLIENT_IP_HEADER] = ip;
    let response: Response;
    try {
      response = await doFetch(`${options.url}/api/v1${path}`, {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined,
        cache: "no-store",
        signal: AbortSignal.timeout(options.timeoutMs),
      });
    } catch {
      log.error("avis", `${method} : API injoignable ou délai dépassé`);
      return { ok: false, code: "INDISPONIBLE" };
    }
    const payload: unknown =
      response.status === 204 ? undefined : await response.json().catch(() => undefined);
    if (!response.ok) {
      const problem = ProblemDetailsSchema.safeParse(payload);
      const code = KNOWN.find((c) => problem.success && c === problem.data.code);
      if (code) return { ok: false, code };
      log.error("avis", `${method} : statut ${response.status}`);
      return { ok: false, code: "INDISPONIBLE" };
    }
    if (!schema) return { ok: true, data: undefined as T };
    const parsed = schema.safeParse(payload);
    if (!parsed.success) {
      log.error("avis", `${method} : réponse non conforme au contrat`);
      return { ok: false, code: "INDISPONIBLE" };
    }
    return { ok: true, data: parsed.data };
  }

  const valid = (slug: string) => SLUG_PATTERN.test(slug) && slug.length <= 120;
  const missing = <T>(): Promise<ReviewResult<T>> =>
    Promise.resolve({ ok: false, code: "PRODUIT_INTROUVABLE" });
  const signedOut = <T>(): Promise<ReviewResult<T>> =>
    Promise.resolve({ ok: false, code: "SESSION_INVALIDE" });

  return {
    async page(slug: string, page: number): Promise<ReviewResult<ReviewPage>> {
      if (!valid(slug)) return missing();
      const path = `/products/${slug}/reviews${page > 1 ? `?page=${page}` : ""}`;
      const hit = cache.get(path);
      if (hit && hit.expires > now()) return { ok: true, data: hit.value };
      const result = await call("GET", path, ReviewPageSchema);
      // Gardée seulement si l'API a servi la page demandée : une page au-delà de la dernière (ramenée par l'API)
      // ne remplit pas la mémoire (relecture de sécurité S8-T01)
      if (result.ok && result.data.page === page) {
        if (cache.size >= MAX_CACHE) cache.delete(cache.keys().next().value as string);
        cache.set(path, { expires: now() + CACHE_MS, value: result.data });
      }
      return result;
    },
    /** Après un changement, la page de la fiche se relit tout de suite (sinon 60 s). */
    forget(slug: string) {
      for (const key of [...cache.keys()])
        if (key.startsWith(`/products/${slug}/reviews`)) cache.delete(key);
    },
    mine(token: string, slug: string): Promise<ReviewResult<MyReview>> {
      if (!valid(slug)) return missing();
      if (!SESSION_TOKEN_PATTERN.test(token)) return signedOut();
      return call("GET", `/products/${slug}/reviews/mine`, MyReviewSchema, { token });
    },
    write(
      token: string,
      slug: string,
      body: { rating: number; comment: string | null },
    ): Promise<ReviewResult<OwnReview>> {
      if (!valid(slug)) return missing();
      if (!SESSION_TOKEN_PATTERN.test(token)) return signedOut();
      return call("PUT", `/products/${slug}/reviews/mine`, OwnReviewSchema, { token, body });
    },
    remove(token: string, slug: string): Promise<ReviewResult<undefined>> {
      if (!valid(slug)) return missing();
      if (!SESSION_TOKEN_PATTERN.test(token)) return signedOut();
      return call("DELETE", `/products/${slug}/reviews/mine`, null, { token });
    },
  };
}
