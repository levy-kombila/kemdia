import "server-only";
import {
  CLIENT_IP_HEADER,
  INTERNAL_KEY_HEADER,
  PROBLEM_ERROR_CODES,
  ProblemDetailsSchema,
  ProblemReportReceiptSchema,
  SESSION_TOKEN_PATTERN,
  type ProblemCategory,
  type ProblemErrorCode,
  type ProblemReportReceipt,
} from "@kemdia/contracts";
import { log } from "@/lib/log";

/**
 * « Signaler un problème » (S8-T02, ADR-0057) côté serveur du site : envoyé avec la session du visiteur, la clé
 * interne, son adresse IP et son navigateur (l'API n'en garde qu'un résumé tiré de listes fixes).
 */
export type FeedbackFailureCode =
  ProblemErrorCode | "SESSION_INVALIDE" | "TROP_DE_REQUETES" | "INDISPONIBLE";
export type FeedbackResult<T> = { ok: true; data: T } | { ok: false; code: FeedbackFailureCode };

export interface FeedbackApiOptions {
  url: string;
  key: string;
  timeoutMs: number;
  fetch?: typeof fetch;
  visitorIp?: () => Promise<string | null>;
}

const KNOWN: readonly FeedbackFailureCode[] = [
  ...PROBLEM_ERROR_CODES,
  "SESSION_INVALIDE",
  "TROP_DE_REQUETES",
];

export function createFeedbackApi(options: FeedbackApiOptions) {
  const doFetch = options.fetch ?? fetch;

  return {
    async report(
      token: string,
      body: { category: ProblemCategory; message: string; page: string | null },
      userAgent: string | null,
    ): Promise<FeedbackResult<ProblemReportReceipt>> {
      if (!SESSION_TOKEN_PATTERN.test(token)) return { ok: false, code: "SESSION_INVALIDE" };
      const headers: Record<string, string> = {
        accept: "application/json",
        "content-type": "application/json",
        authorization: `Bearer ${token}`,
        [INTERNAL_KEY_HEADER]: options.key,
      };
      if (userAgent) headers["x-kemdia-user-agent"] = userAgent.slice(0, 500);
      const ip = options.visitorIp ? await options.visitorIp().catch(() => null) : null;
      if (ip) headers[CLIENT_IP_HEADER] = ip;
      let response: Response;
      try {
        response = await doFetch(`${options.url}/api/v1/feedback/problems`, {
          method: "POST",
          headers,
          body: JSON.stringify(body),
          cache: "no-store",
          signal: AbortSignal.timeout(options.timeoutMs),
        });
      } catch {
        log.error("signalements", "POST : API injoignable ou délai dépassé");
        return { ok: false, code: "INDISPONIBLE" };
      }
      const payload: unknown = await response.json().catch(() => undefined);
      if (!response.ok) {
        const problem = ProblemDetailsSchema.safeParse(payload);
        const code = KNOWN.find((c) => problem.success && c === problem.data.code);
        if (code) return { ok: false, code };
        log.error("signalements", `POST : statut ${response.status}`);
        return { ok: false, code: "INDISPONIBLE" };
      }
      const parsed = ProblemReportReceiptSchema.safeParse(payload);
      if (!parsed.success) {
        log.error("signalements", "POST : réponse non conforme au contrat");
        return { ok: false, code: "INDISPONIBLE" };
      }
      return { ok: true, data: parsed.data };
    },
  };
}
