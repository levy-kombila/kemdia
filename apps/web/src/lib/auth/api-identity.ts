import "server-only";
import {
  CLIENT_IP_HEADER,
  IDENTITY_ERROR_CODES,
  CurrentSessionSchema,
  DEVICE_ALERT_TOKEN_PATTERN,
  DEVICE_ID_PATTERN,
  DeviceNotMeResultSchema,
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
  type DeviceNotMeResult,
  type OpenedSession,
  type ResetStarted,
  type SignupStarted,
} from "@kemdia/contracts";
import { z } from "zod";
import type { AuthFailure, SignupInput } from "./types";
import { log } from "@/lib/log";

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
      log.error("identité", `${path} : ${timeout ? "délai dépassé" : "API injoignable"}`);
      return { ok: false, code: "INDISPONIBLE" };
    }

    const payload: unknown =
      response.status === 204 ? undefined : await response.json().catch(() => undefined);

    if (!response.ok) {
      const problem = ProblemDetailsSchema.safeParse(payload);
      const code = problem.success ? problem.data.code : undefined;
      const identityCode = IDENTITY_ERROR_CODES.find((c) => c === code);
      if (identityCode) {
        const retry = Number(response.headers.get("retry-after"));
        return {
          ok: false,
          code: identityCode,
          ...(Number.isInteger(retry) && retry > 0 ? { retryAfterSeconds: retry } : {}),
        };
      }
      log.error("identité", `${path} : statut ${response.status}`);
      return { ok: false, code: "INDISPONIBLE" };
    }

    const parsed = schema.safeParse(payload);
    if (!parsed.success) {
      // Chemins des champs seulement : jamais les valeurs reçues dans le journal
      const fields = parsed.error.issues.map((i) => i.path.join(".") || "(racine)").slice(0, 5);
      log.error("identité", `${path} : réponse non conforme au contrat (${fields.join(", ")})`);
      return { ok: false, code: "INDISPONIBLE" };
    }
    return { ok: true, data: parsed.data };
  }

  return {
    signup: (input: SignupInput): Promise<ApiResult<SignupStarted>> =>
      call("POST", "/signup", SignupStartedSchema, { body: input }),
    verifySignup: (
      ticket: string,
      code: string,
      userAgent: string | null,
      device?: string | null,
    ) =>
      call("POST", "/signup/verify", SignupVerifiedSchema, {
        body: {
          ticket,
          code,
          ...(device && DEVICE_ID_PATTERN.test(device) ? { device } : {}),
        },
        userAgent,
      }),
    resendSignup: (ticket: string): Promise<ApiResult<SignupStarted>> =>
      call("POST", "/signup/resend", SignupStartedSchema, { body: { ticket } }),
    /**
     * `device` : identifiant aléatoire du navigateur (cookie `kemdia_appareil`, S7.5-T04) pour l'avis « nouvel
     * appareil » ; envoyé seulement s'il a la bonne forme.
     */
    login: (
      identifier: string,
      password: string,
      userAgent: string | null,
      device?: string | null,
    ): Promise<ApiResult<OpenedSession>> =>
      call("POST", "/login", OpenedSessionSchema, {
        body: {
          identifier,
          password,
          ...(device && DEVICE_ID_PATTERN.test(device) ? { device } : {}),
        },
        userAgent,
      }),
    /** Lien « ce n'est pas moi » de l'avis : ferme toutes les sessions du compte. Jeton mal formé → refus direct. */
    deviceNotMe: (token: string): Promise<ApiResult<DeviceNotMeResult>> =>
      DEVICE_ALERT_TOKEN_PATTERN.test(token)
        ? call("POST", "/devices/not-me", DeviceNotMeResultSchema, { body: { token } })
        : Promise.resolve({ ok: false, code: "ALERTE_INVALIDE" }),
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
    /** Mot de passe actuel + nouveau (S7-T07) : toutes les sessions fermées, une nouvelle ouverte ici. */
    changePassword: (
      token: string,
      currentPassword: string,
      newPassword: string,
      userAgent: string | null,
    ): Promise<ApiResult<OpenedSession>> =>
      SESSION_TOKEN_PATTERN.test(token)
        ? call("POST", "/password/change", OpenedSessionSchema, {
            token,
            body: { currentPassword, newPassword },
            userAgent,
          })
        : Promise.resolve({ ok: false, code: "SESSION_INVALIDE" }),
  };
}

export type IdentityApi = ReturnType<typeof createIdentityApi>;
export type { AccountView };
