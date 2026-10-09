import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, SESSION_MAX_AGE_S, cookieOptions } from "@/lib/auth/cookies";
import { NONCE_HEADER, buildCsp, generateNonce } from "@/lib/security/csp";
import { checkMutationOrigin } from "@/lib/security/origin";

const CSP_HEADER = "Content-Security-Policy";

/**
 * Passe obligatoire de chaque requête vers une page ou une route du site :
 *
 * 1. **CSRF** (S4-T07, ADR-0021) : une requête qui modifie quelque chose (POST, actions serveur…) venue d'un autre
 *    site, ou sans en-tête `Origin`, est refusée (403) avant d'atteindre le code.
 * 2. **CSP à nonce** (S4-T07) : un nonce neuf par requête, transmis à Next.js (qui l'ajoute à ses scripts)
 *    et renvoyé dans l'en-tête Content-Security-Policy.
 * 3. **Cookie de session glissant** (S4-T05, ADR-0019) : à chaque vraie page visitée, le cookie repart pour 30 jours.
 *    Aucun appel à l'API ici, aucune décision d'accès : chaque page et chaque action vérifie la session elle-même.
 */
export function proxy(request: NextRequest) {
  const verdict = checkMutationOrigin(request.method, request.headers);
  if (!verdict.ok) {
    return new NextResponse("Requête refusée : elle ne vient pas du site Kemdia.", {
      status: 403,
      headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" },
    });
  }

  const nonce = generateNonce();
  const csp = buildCsp(nonce, { dev: process.env.NODE_ENV === "development" });
  // Next.js lit le nonce dans l'en-tête CSP de la REQUÊTE pour l'ajouter à ses scripts
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set(NONCE_HEADER, nonce);
  requestHeaders.set(CSP_HEADER, csp);
  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set(CSP_HEADER, csp);

  const token = request.cookies.get(SESSION_COOKIE)?.value;
  // Vraies pages seulement (en-tête `Sec-Fetch-Dest: document`, envoyé par les navigateurs) : pas les
  // préchargements de liens, qui partent en parallèle et remettraient un cookie que le serveur vient
  // d'effacer. Un navigateur qui n'envoie pas cet en-tête garde simplement son cookie sans prolongation.
  const document = request.headers.get("sec-fetch-dest") === "document";
  if (request.method === "GET" && token && document) {
    response.cookies.set(SESSION_COOKIE, token, cookieOptions(SESSION_MAX_AGE_S));
  }
  return response;
}

export const config = {
  // Pages ET routes du site (le contrôle CSRF doit tout couvrir) ; ni fichiers statiques ni images
  matcher: [
    "/((?!_next/static|_next/image|images/|fonts/|favicon\\.ico$|icon\\.svg$|robots\\.txt$|sitemap\\.xml$|.*opengraph-image).*)",
  ],
};
