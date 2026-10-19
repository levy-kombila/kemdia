import "server-only";
import {
  AccountDataExportSchema,
  AccountDeletionStatusSchema,
  CLIENT_IP_HEADER,
  IDENTITY_ERROR_CODES,
  INTERNAL_KEY_HEADER,
  PRIVACY_ERROR_CODES,
  ProblemDetailsSchema,
  SESSION_TOKEN_PATTERN,
  type AccountDataExport,
  type AccountDeletionStatus,
  type IdentityErrorCode,
  type PrivacyErrorCode,
} from "@kemdia/contracts";
import { z } from "zod";
import { log } from "@/lib/log";

/**
 * Adaptateur « API » des données personnelles (S7-T08, ADR-0047) : `/api/v1/account/*`, appelé par le SERVEUR du site
 * seulement (clé interne + jeton du cookie `HttpOnly`). Comme les autres adaptateurs : réponses vérifiées par le
 * contrat, erreur métier → son `code`, tout le reste → `INDISPONIBLE` ; journaux sans jeton, mot de passe ni contenu.
 */

export type PrivacyFailureCode = IdentityErrorCode | PrivacyErrorCode | "INDISPONIBLE";
export type PrivacyResult<T> =
  { ok: true; data: T } | { ok: false; code: PrivacyFailureCode; retryAfterSeconds?: number };

export interface PrivacyApiOptions {
  url: string;
  key: string;
  timeoutMs: number;
  fetch?: typeof fetch;
  visitorIp?: () => Promise<string | null>;
}

const KNOWN_CODES: readonly PrivacyFailureCode[] = [
  ...IDENTITY_ERROR_CODES,
  ...PRIVACY_ERROR_CODES,
];
const NoContent = z.undefined();

export function createPrivacyApi(options: PrivacyApiOptions) {
  const doFetch = options.fetch ?? fetch;

  async function call<T>(
    method: "GET" | "POST",
    path: string,
    token: string,
    schema: z.ZodType<T>,
    body?: object,
    timeoutMs = options.timeoutMs,
  ): Promise<PrivacyResult<T>> {
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
      response = await doFetch(`${options.url}/api/v1/account${path}`, {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined,
        cache: "no-store",
        redirect: "error",
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (error) {
      const timeout = error instanceof DOMException && error.name === "TimeoutError";
      log.error(
        "données personnelles",
        `${method} ${path} : ${timeout ? "délai dépassé" : "API injoignable"}`,
      );
      return { ok: false, code: "INDISPONIBLE" };
    }

    const payload: unknown =
      response.status === 204 ? undefined : await response.json().catch(() => undefined);
    if (!response.ok) {
      const problem = ProblemDetailsSchema.safeParse(payload);
      const code = problem.success ? problem.data.code : undefined;
      const known = KNOWN_CODES.find((c) => c === code);
      if (known) {
        const retry = Number(response.headers.get("retry-after"));
        return {
          ok: false,
          code: known,
          ...(Number.isInteger(retry) && retry > 0 ? { retryAfterSeconds: retry } : {}),
        };
      }
      log.error("données personnelles", `${method} ${path} : statut ${response.status}`);
      return { ok: false, code: "INDISPONIBLE" };
    }
    const parsed = schema.safeParse(payload);
    if (!parsed.success) {
      const fields = parsed.error.issues.map((i) => i.path.join(".") || "(racine)").slice(0, 5);
      log.error(
        "données personnelles",
        `${method} ${path} : réponse non conforme au contrat (${fields.join(", ")})`,
      );
      return { ok: false, code: "INDISPONIBLE" };
    }
    return { ok: true, data: parsed.data };
  }

  return {
    /** Copie de mes données (peut être longue à rassembler : délai triple). */
    exportData: (token: string): Promise<PrivacyResult<AccountDataExport>> =>
      call("GET", "/data", token, AccountDataExportSchema, undefined, options.timeoutMs * 3),
    deletionStatus: (token: string): Promise<PrivacyResult<AccountDeletionStatus>> =>
      call("GET", "/deletion", token, AccountDeletionStatusSchema),
    /** Suppression définitive (mot de passe actuel). Argon2id + effacement de tous les modules : délai double. */
    deleteAccount: (token: string, password: string): Promise<PrivacyResult<undefined>> =>
      call("POST", "/delete", token, NoContent, { password, confirm: true }, options.timeoutMs * 2),
  };
}

export type PrivacyApi = ReturnType<typeof createPrivacyApi>;
