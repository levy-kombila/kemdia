import "server-only";
import {
  CLIENT_IP_HEADER,
  INTERNAL_KEY_HEADER,
  ProblemDetailsSchema,
  SESSION_TOKEN_PATTERN,
  SandboxDecisionSchema,
  SandboxPaymentRequestPageSchema,
  type SandboxDecision,
  type SandboxPaymentRequestPage,
} from "@kemdia/contracts";
import { z } from "zod";
import { log } from "@/lib/log";

/**
 * Adaptateur « API » du téléphone simulé (S5-T05, ADR-0027) : appelle `/api/v1/sandbox/mobile-money/*` depuis le
 * serveur du site uniquement (clé interne + jeton de session, `server-only`), comme `lib/orders/api-cart.ts`.
 * Bac à sable fermé (préproduction, production : 404 sans code) → `BAC_A_SABLE_FERME`.
 */
export type SandboxFailureCode =
  | "DEMANDE_INTROUVABLE"
  | "CODE_PIN_INVALIDE"
  | "PAIEMENT_INDISPONIBLE"
  | "SESSION_INVALIDE"
  | "TROP_DE_REQUETES"
  | "BAC_A_SABLE_FERME"
  | "INDISPONIBLE";
export type SandboxApiResult<T> = { ok: true; data: T } | { ok: false; code: SandboxFailureCode };

export interface SandboxApiOptions {
  url: string;
  key: string;
  timeoutMs: number;
  fetch?: typeof fetch;
  visitorIp?: () => Promise<string | null>;
}

const KNOWN_CODES: readonly SandboxFailureCode[] = [
  "DEMANDE_INTROUVABLE",
  "CODE_PIN_INVALIDE",
  "PAIEMENT_INDISPONIBLE",
  "SESSION_INVALIDE",
  "TROP_DE_REQUETES",
];

export function createSandboxApi(options: SandboxApiOptions) {
  const doFetch = options.fetch ?? fetch;

  async function call<T>(
    method: "GET" | "POST",
    path: string,
    token: string,
    schema: z.ZodType<T>,
    body?: object,
  ): Promise<SandboxApiResult<T>> {
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
      response = await doFetch(`${options.url}/api/v1/sandbox/mobile-money/requests${path}`, {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined,
        cache: "no-store",
        signal: AbortSignal.timeout(options.timeoutMs),
      });
    } catch {
      log.error("téléphone simulé", `${method} : API injoignable ou délai dépassé`);
      return { ok: false, code: "INDISPONIBLE" };
    }
    const payload: unknown = await response.json().catch(() => undefined);
    if (!response.ok) {
      const problem = ProblemDetailsSchema.safeParse(payload);
      const code = KNOWN_CODES.find((c) => problem.success && c === problem.data.code);
      if (code) return { ok: false, code };
      if (response.status === 404) return { ok: false, code: "BAC_A_SABLE_FERME" };
      log.error("téléphone simulé", `${method} : statut ${response.status}`);
      return { ok: false, code: "INDISPONIBLE" };
    }
    const parsed = schema.safeParse(payload);
    if (!parsed.success) {
      log.error("téléphone simulé", `${method} : réponse non conforme au contrat`);
      return { ok: false, code: "INDISPONIBLE" };
    }
    return { ok: true, data: parsed.data };
  }

  return {
    list: (token: string): Promise<SandboxApiResult<SandboxPaymentRequestPage>> =>
      call("GET", "", token, SandboxPaymentRequestPageSchema),
    decide: (
      token: string,
      paymentId: string,
      decision: "approve" | "decline",
      pin?: string,
    ): Promise<SandboxApiResult<SandboxDecision>> =>
      call("POST", `/${encodeURIComponent(paymentId)}`, token, SandboxDecisionSchema, {
        decision,
        ...(pin === undefined ? {} : { pin }),
      }),
  };
}

export type SandboxApi = ReturnType<typeof createSandboxApi>;
