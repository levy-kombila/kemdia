import "server-only";
import {
  CART_ERROR_CODES,
  CLIENT_IP_HEADER,
  CartMergedSchema,
  CartSchema,
  INTERNAL_KEY_HEADER,
  ProblemDetailsSchema,
  SESSION_TOKEN_PATTERN,
  type Cart,
  type CartErrorCode,
  type CartMerged,
} from "@kemdia/contracts";
import { z } from "zod";
import { log } from "@/lib/log";

/**
 * Adaptateur « API » du panier serveur (S5-T01, ADR-0023) : appelle `/api/v1/cart/*` depuis le serveur du site
 * uniquement (clé interne + jeton de session, `server-only`). Même principe que `lib/auth/api-identity.ts` :
 *
 * - chaque réponse est vérifiée par le schéma du contrat partagé ;
 * - erreur métier → son `code` ; session refusée → `SESSION_INVALIDE` ; tout le reste → `INDISPONIBLE` ;
 * - les journaux ne contiennent ni jeton ni contenu du panier : seulement la route et le statut.
 */

export type CartFailureCode =
  CartErrorCode | "SESSION_INVALIDE" | "TROP_DE_REQUETES" | "INDISPONIBLE";
export type CartApiResult<T> = { ok: true; data: T } | { ok: false; code: CartFailureCode };

export interface CartApiOptions {
  url: string;
  key: string;
  timeoutMs: number;
  fetch?: typeof fetch;
  /** Adresse du visiteur de la requête en cours (S4-T07), transmise avec la clé interne */
  visitorIp?: () => Promise<string | null>;
}

type Method = "GET" | "POST" | "PUT" | "DELETE";

const KNOWN_CODES: readonly CartFailureCode[] = [
  ...CART_ERROR_CODES,
  "SESSION_INVALIDE",
  "TROP_DE_REQUETES",
];

export function createCartApi(options: CartApiOptions) {
  const doFetch = options.fetch ?? fetch;

  async function call<T>(
    method: Method,
    path: string,
    token: string,
    schema: z.ZodType<T>,
    body?: object,
  ): Promise<CartApiResult<T>> {
    // Un jeton mal formé n'est même pas envoyé
    if (!SESSION_TOKEN_PATTERN.test(token)) return { ok: false, code: "SESSION_INVALIDE" };
    const headers: Record<string, string> = {
      accept: "application/json",
      authorization: `Bearer ${token}`,
      [INTERNAL_KEY_HEADER]: options.key,
    };
    if (body) headers["content-type"] = "application/json";
    const ip = options.visitorIp ? await options.visitorIp().catch(() => null) : null;
    if (ip) headers[CLIENT_IP_HEADER] = ip;

    let response: Response;
    try {
      response = await doFetch(`${options.url}/api/v1/cart${path}`, {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined,
        cache: "no-store",
        signal: AbortSignal.timeout(options.timeoutMs),
      });
    } catch (error) {
      const timeout = error instanceof DOMException && error.name === "TimeoutError";
      log.error(
        "panier",
        `${method} ${routeOf(path)} : ${timeout ? "délai dépassé" : "API injoignable"}`,
      );
      return { ok: false, code: "INDISPONIBLE" };
    }

    const payload: unknown = await response.json().catch(() => undefined);
    if (!response.ok) {
      const problem = ProblemDetailsSchema.safeParse(payload);
      const code = KNOWN_CODES.find((c) => problem.success && c === problem.data.code);
      if (code) return { ok: false, code };
      log.error("panier", `${method} ${routeOf(path)} : statut ${response.status}`);
      return { ok: false, code: "INDISPONIBLE" };
    }
    const parsed = schema.safeParse(payload);
    if (!parsed.success) {
      const fields = parsed.error.issues.map((i) => i.path.join(".") || "(racine)").slice(0, 5);
      log.error(
        "panier",
        `${method} ${routeOf(path)} : réponse non conforme au contrat (${fields.join(", ")})`,
      );
      return { ok: false, code: "INDISPONIBLE" };
    }
    return { ok: true, data: parsed.data };
  }

  return {
    get: (token: string): Promise<CartApiResult<Cart>> => call("GET", "", token, CartSchema),
    add: (token: string, variantId: string, quantity: number): Promise<CartApiResult<Cart>> =>
      call("POST", "/items", token, CartSchema, { variantId, quantity }),
    setQuantity: (
      token: string,
      variantId: string,
      quantity: number,
    ): Promise<CartApiResult<Cart>> =>
      call("PUT", `/items/${encodeURIComponent(variantId)}`, token, CartSchema, { quantity }),
    remove: (token: string, variantId: string): Promise<CartApiResult<Cart>> =>
      call("DELETE", `/items/${encodeURIComponent(variantId)}`, token, CartSchema),
    clear: (token: string): Promise<CartApiResult<Cart>> => call("DELETE", "", token, CartSchema),
    /** `mergeId` : même identifiant pour la même réunion renvoyée (l'API ne l'applique qu'une fois). */
    merge: (
      token: string,
      mergeId: string,
      lines: readonly { variantId: string; quantity: number }[],
    ): Promise<CartApiResult<CartMerged>> =>
      call("POST", "/merge", token, CartMergedSchema, { mergeId, lines }),
  };
}

/** Route sans identifiant de variante (les journaux ne disent pas ce qu'il y a dans le panier). */
function routeOf(path: string): string {
  return path.startsWith("/items/") ? "/items/{variante}" : path || "/";
}

export type CartApi = ReturnType<typeof createCartApi>;
