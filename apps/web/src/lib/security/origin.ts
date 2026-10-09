/**
 * Protection CSRF (S4-T07, ADR-0021, HIGH-16) : contrôle d'origine STRICT de toute requête qui modifie quelque chose.
 *
 * Next.js compare déjà l'origine des actions serveur, mais laisse passer une requête SANS en-tête `Origin`.
 * Ici, toute requête autre que GET / HEAD / OPTIONS doit :
 * 1. porter un en-tête `Origin` dont l'hôte est celui du site (même règle que Next : `x-forwarded-host` ou `host`) ;
 * 2. si le navigateur envoie `Sec-Fetch-Site`, valoir `same-origin`.
 * Sinon : 403. S'ajoute aux cookies `SameSite=Lax` (S4-T05) et au contrôle de Next.js (défense en profondeur).
 */
const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

export type OriginVerdict =
  { ok: true } | { ok: false; reason: "origine-absente" | "origine-etrangere" | "site-etranger" };

export function checkMutationOrigin(method: string, headers: Headers): OriginVerdict {
  if (SAFE_METHODS.has(method.toUpperCase())) return { ok: true };

  const fetchSite = headers.get("sec-fetch-site");
  if (fetchSite !== null && fetchSite !== "same-origin")
    return { ok: false, reason: "site-etranger" };

  const origin = headers.get("origin");
  if (!origin || origin === "null") return { ok: false, reason: "origine-absente" };
  // Plusieurs relais peuvent ajouter leur valeur : la première est celle vue par le navigateur
  const host = (headers.get("x-forwarded-host") ?? headers.get("host") ?? "").split(",")[0]?.trim();
  let originHost: string;
  try {
    originHost = new URL(origin).host;
  } catch {
    return { ok: false, reason: "origine-etrangere" };
  }
  return host && originHost.toLowerCase() === host.toLowerCase()
    ? { ok: true }
    : { ok: false, reason: "origine-etrangere" };
}
