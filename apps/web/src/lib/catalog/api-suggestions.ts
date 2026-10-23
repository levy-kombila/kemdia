import "server-only";
import {
  CLIENT_IP_HEADER,
  INTERNAL_KEY_HEADER,
  MAX_QUERY_LENGTH,
  SearchSuggestionsSchema,
  type SearchSuggestions,
} from "@kemdia/contracts";
import { log } from "@/lib/log";

/**
 * Suggestions pendant la frappe (S7.5-T06) demandées à l'API par le serveur du site. Contrairement au reste du
 * catalogue, PAS de cache partagé : chaque demande part avec l'adresse du visiteur, pour que la limite de l'API
 * (60 par minute par le site) compte par visiteur et non pour tout le site.
 */
export type SuggestionsResult =
  { status: "ok"; data: SearchSuggestions } | { status: "too-many" } | { status: "unavailable" };

export interface SuggestionsOptions {
  url: string;
  key: string;
  timeoutMs: number;
  visitorIp: string | null;
  fetch?: typeof fetch;
}

export async function fetchSuggestions(
  options: SuggestionsOptions,
  q: string,
): Promise<SuggestionsResult> {
  const doFetch = options.fetch ?? fetch;
  const params = new URLSearchParams({ q: q.slice(0, MAX_QUERY_LENGTH) });
  const headers: Record<string, string> = {
    accept: "application/json",
    [INTERNAL_KEY_HEADER]: options.key,
  };
  if (options.visitorIp) headers[CLIENT_IP_HEADER] = options.visitorIp;
  let response: Response;
  try {
    response = await doFetch(`${options.url}/api/v1/products/suggestions?${params.toString()}`, {
      headers,
      cache: "no-store",
      signal: AbortSignal.timeout(options.timeoutMs),
    });
  } catch {
    log.error("catalogue", "/products/suggestions : API injoignable ou délai dépassé");
    return { status: "unavailable" };
  }
  if (response.status === 429) {
    await response.body?.cancel().catch(() => undefined);
    return { status: "too-many" };
  }
  if (!response.ok) {
    await response.body?.cancel().catch(() => undefined);
    log.error("catalogue", `/products/suggestions : statut ${response.status}`);
    return { status: "unavailable" };
  }
  const parsed = SearchSuggestionsSchema.safeParse(await response.json().catch(() => undefined));
  if (!parsed.success) {
    // Jamais le texte tapé ni les valeurs reçues dans le journal
    log.error("catalogue", "/products/suggestions : réponse non conforme au contrat");
    return { status: "unavailable" };
  }
  return { status: "ok", data: parsed.data };
}
