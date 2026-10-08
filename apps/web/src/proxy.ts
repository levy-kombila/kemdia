import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, SESSION_MAX_AGE_S, cookieOptions } from "@/lib/auth/cookies";

/**
 * Cookie de session glissant (S4-T05, ADR-0019) : à chaque page visitée, le cookie repart pour 30 jours,
 * comme la session dans l'API (qui reste seule juge : un cookie dont la session est fermée ne vaut rien).
 * Aucun appel à l'API ici, aucune décision d'accès : chaque page et chaque action vérifie la session elle-même.
 */
export function proxy(request: NextRequest) {
  const response = NextResponse.next();
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
  // Pages seulement : ni fichiers statiques, ni images, ni routes de l'API du site
  matcher: [
    "/((?!_next/static|_next/image|api/|images/|fonts/|favicon\\.ico$|icon\\.svg$|robots\\.txt$|sitemap\\.xml$|.*opengraph-image).*)",
  ],
};
