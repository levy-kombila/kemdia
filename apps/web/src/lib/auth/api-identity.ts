import "server-only";
import {
  CLIENT_IP_HEADER,
  CurrentSessionSchema,
  INTERNAL_KEY_HEADER,
  LogoutAllSchema,
  OpenedSessionSchema,
  ProblemDetailsSchema,
  ResetStartedSchema,
  SESSION_TOKEN_PATTERN,
  SignupStartedSchema,
  SignupVerifiedSchema,
  type AccountView,
  type CurrentSession,
  type OpenedSession,
  type ResetStarted,
  type SignupStarted,
} from "@kemdia/contracts";
import { z } from "zod";
import type { AuthFailure, SignupInput } from "./types";

/**
 * Adaptateur « API » de l'identité (S4-T05, ADR-0019) : appelle les routes `/api/v1/auth/*`
 * depuis le serveur du site uniquement (clé interne, `server-only`).
 *
 * - Chaque réponse est vérifiée par le schéma du contrat partagé.
 * - Erreur métier de l'API → son `code` (et `Retry-After`) ; tout le reste → `INDISPONIBLE`.
 * - Les journaux ne contiennent ni identifiant, ni mot de passe, ni code, ni jeton : seulement la route et le statut.
 */

export type ApiResult<T> = { ok: true; data: T } | AuthFailure;

export interface IdentityApiOptions {
  url: string;
  key: string;
  timeoutMs: number;
  fetch?: typeof fetch;
  /** Adresse du visiteur de la requête en cours (S4-T07), transmise à l'API avec la clé interne */
  visitorIp?: () => Promise<string | null>;
}

type CallOptions = { body?: object; token?: string; userAgent?: string | null };

const NoContent = z.undefined();

export function createIdentityApi(options: IdentityApiOptions) {
  const doFetch = options.fetch ?? fetch;

  async function call<T>(
    method: "GET" | "POST",
    path: string,
    schema: z.ZodType<T>,
    { body, token, userAgent }: CallOptions = {},
  ): Promise<ApiResult<T>> {
    const headers: Record<string, string> = {
      accept: "application/json",
      [INTERNAL_KEY_HEADER]: options.key,
    };
    if (body) headers["content-type"] = "application/json";
    if (token) headers.authorization = `Bearer ${token}`;
    // Appareil du client, pour la liste de ses sessions (l'API le résume et le nettoie)
    if (userAgent) headers["x-kemdia-user-agent"] = userAgent.slice(0, 500);
    // Visiteur réel : limites par visiteur et journal d'audit dans l'API (S4-T07)
    const ip = options.visitorIp ? await options.visitorIp().catch(() => null) : null;
    if (ip) headers[CLIENT_IP_HEADER] = ip;

    let response: Response;
    try {
      response = await doFetch(`${options.url}/api/v1/auth${path}`, {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined,
        cache: "no-store",
        signal: AbortSignal.timeout(options.timeoutMs),
      });
    } catch (error) {
      const timeout = error instanceof DOMException && error.name === "TimeoutError";
      console.error(`[identité] ${path} : ${timeout ? "délai dépassé" : "API injoignable"}`);
      return { ok: false, code: "INDISPONIBLE" };
    }

    const payload: unknown =
      response.status === 204 ? undefined : await response.json().catch(() => undefined);

    if (!response.ok) {
      const problem = ProblemDetailsSchema.safeParse(payload);
      if (problem.success && problem.data.code) {
        const retry = Number(response.headers.get("retry-after"));
        return {
          ok: false,
          code: problem.data.code,
          ...(Number.isInteger(retry) && retry > 0 ? { retryAfterSeconds: retry } : {}),
        };
      }
      console.error(`[identité] ${path} : statut ${response.status}`);
      return { ok: false, code: "INDISPONIBLE" };
    }

    const parsed = schema.safeParse(payload);
    if (!parsed.success) {
      // Chemins des champs seulement : jamais les valeurs reçues dans le journal
      const fields = parsed.error.issues.map((i) => i.path.join(".") || "(racine)").slice(0, 5);
      console.error(`[identité] ${path} : réponse non conforme au contrat (${fields.join(", ")})`);
      return { ok: false, code: "INDISPONIBLE" };
    }
    return { ok: true, data: parsed.data };
  }

  return {
    signup: (input: SignupInput): Promise<ApiResult<SignupStarted>> =>
      call("POST", "/signup", SignupStartedSchema, { body: input }),
    verifySignup: (ticket: string, code: string, userAgent: string | null) =>
      call("POST", "/signup/verify", SignupVerifiedSchema, {
        body: { ticket, code },
        userAgent,
      }),
    resendSignup: (ticket: string): Promise<ApiResult<SignupStarted>> =>
      call("POST", "/signup/resend", SignupStartedSchema, { body: { ticket } }),
    login: (
      identifier: string,
      password: string,
      userAgent: string | null,
    ): Promise<ApiResult<OpenedSession>> =>
      call("POST", "/login", OpenedSessionSchema, { body: { identifier, password }, userAgent }),
    /** Session valable ? (la prolonge). Un jeton mal formé n'est même pas envoyé. */
    session: (token: string): Promise<ApiResult<CurrentSession>> =>
      SESSION_TOKEN_PATTERN.test(token)
        ? call("GET", "/session", CurrentSessionSchema, { token })
        : Promise.resolve({ ok: false, code: "SESSION_INVALIDE" }),
    logout: (token: string): Promise<ApiResult<undefined>> =>
      SESSION_TOKEN_PATTERN.test(token)
        ? call("POST", "/logout", NoContent, { token })
        : Promise.resolve({ ok: false, code: "SESSION_INVALIDE" }),
    logoutAll: (token: string): Promise<ApiResult<{ revoked: number }>> =>
      SESSION_TOKEN_PATTERN.test(token)
        ? call("POST", "/logout-all", LogoutAllSchema, { token })
        : Promise.resolve({ ok: false, code: "SESSION_INVALIDE" }),
    forgotPassword: (identifier: string): Promise<ApiResult<ResetStarted>> =>
      call("POST", "/password/forgot", ResetStartedSchema, { body: { identifier } }),
    resendReset: (ticket: string): Promise<ApiResult<ResetStarted>> =>
      call("POST", "/password/resend", ResetStartedSchema, { body: { ticket } }),
    resetPassword: (
      ticket: string,
      code: string,
      newPassword: string,
      userAgent: string | null,
    ): Promise<ApiResult<OpenedSession>> =>
      call("POST", "/password/reset", OpenedSessionSchema, {
        body: { ticket, code, newPassword },
        userAgent,
      }),
  };
}

export type IdentityApi = ReturnType<typeof createIdentityApi>;
export type { AccountView };
