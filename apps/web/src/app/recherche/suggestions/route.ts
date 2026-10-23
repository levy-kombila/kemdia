import { fetchSuggestions } from "@/lib/catalog/api-suggestions";
import { catalogSource } from "@/lib/config/server-config";
import { UNKNOWN_VISITOR, clientIpHeaderName, visitorIp } from "@/lib/security/client-ip";
import { MAX_QUERY_LENGTH } from "@/lib/search-params";

/**
 * Suggestions pendant la frappe (S7.5-T06), appelées par le champ de recherche du site (même origine : CSP
 * « connect-src 'self' »). Le serveur du site relaie à l'API avec sa clé interne ET l'adresse du visiteur
 * (CLIENT_IP_HEADER) : la limite de l'API (60 par minute par le site) s'applique à chaque visiteur.
 */
const EMPTY = { products: [], categories: [], brands: [] };
const COMMON = { "x-content-type-options": "nosniff" } as const;

function json(status: number, body: unknown, cache: string, extra: Record<string, string> = {}) {
  return Response.json(body, { status, headers: { ...COMMON, "cache-control": cache, ...extra } });
}

export async function GET(request: Request): Promise<Response> {
  const q = new URL(request.url).searchParams.get("q") ?? "";
  // Texte trop long : refusé sans appeler l'API (le champ en limite déjà la longueur)
  if (q.length > MAX_QUERY_LENGTH) return json(400, EMPTY, "no-store");
  if (q.trim().length < 2) return json(200, EMPTY, "public, max-age=60");
  // Sans CLIENT_IP_HEADER configuré : compteur commun « inconnue » plutôt qu'aucune limite (relecture de sécurité)
  const ipHeader = clientIpHeaderName();
  const ip = (ipHeader ? visitorIp(request.headers, ipHeader) : null) ?? UNKNOWN_VISITOR;
  const result = await fetchSuggestions({ ...catalogSource(), visitorIp: ip }, q);
  switch (result.status) {
    case "ok":
      return json(200, result.data, "public, max-age=60, stale-while-revalidate=300");
    case "too-many":
      return json(429, EMPTY, "no-store", { "retry-after": "60" });
    default:
      return json(503, EMPTY, "no-store");
  }
}
