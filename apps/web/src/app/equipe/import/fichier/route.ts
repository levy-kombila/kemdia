import { CATALOG_IMPORT_LIMITS, SESSION_TOKEN_PATTERN, hasRole } from "@kemdia/contracts/constants";
import { cookies } from "next/headers";
import { SESSION_COOKIE, expiredCookieOptions } from "@/lib/auth/cookies";
import { forgetSession, getCurrentAccount } from "@/lib/auth/session";
import { readAtMost } from "@/lib/orders/api-orders";
import { decodeCatalogFile, isImportMode } from "@/lib/staff/catalog-import";
import { staffErrorMessage } from "@/lib/staff/messages";
import { sessionToken, staffApi } from "@/lib/staff/staff";

/**
 * Fichier du catalogue envoyé par l'équipe Catalogue (S8-T03, ADR-0058) : `POST /equipe/import/fichier?mode=check|import`,
 * corps = le fichier CSV. Même principe que les photos : origine contrôlée par `proxy.ts`, session vérifiée AVANT de
 * lire le corps, 2 Mo au plus lus en flux, un envoi à la fois. L'API refait tout (rôle, double authentification).
 */
const HEADERS = { "cache-control": "no-store", "x-content-type-options": "nosniff" } as const;
let inFlight = 0;

function reply(status: number, body: object) {
  return Response.json(body, { status, headers: HEADERS });
}

export async function POST(request: Request): Promise<Response> {
  const mode = new URL(request.url).searchParams.get("mode");
  if (!isImportMode(mode)) return reply(400, { ok: false, message: "Action inconnue." });
  const token = await sessionToken();
  const current = token && SESSION_TOKEN_PATTERN.test(token) ? await getCurrentAccount() : null;
  if (!token || current?.status !== "signed-in") {
    if (token) {
      forgetSession(token);
      (await cookies()).set(SESSION_COOKIE, "", expiredCookieOptions());
    }
    return reply(401, {
      ok: false,
      signedOut: true,
      message: staffErrorMessage("SESSION_INVALIDE"),
    });
  }
  if (!hasRole(current.account.roles, "catalog"))
    return reply(403, { ok: false, message: staffErrorMessage("ACCES_REFUSE") });

  const announced = Number(request.headers.get("content-length"));
  if (Number.isFinite(announced) && announced > CATALOG_IMPORT_LIMITS.maxBytes)
    return reply(413, { ok: false, message: "Fichier trop gros : 2 Mo au plus (découpez-le)." });
  if (inFlight >= 1)
    return reply(503, { ok: false, message: "Un import est déjà en cours : patientez." });

  inFlight += 1;
  try {
    const bytes = await readAtMost(
      new Response(request.body),
      CATALOG_IMPORT_LIMITS.maxBytes,
    ).catch(() => null);
    const text = bytes ? decodeCatalogFile(bytes) : null;
    if (!text)
      return reply(415, { ok: false, message: staffErrorMessage("FICHIER_IMPORT_INVALIDE") });
    const result = await staffApi().importCatalog(token, mode, text);
    if (result.ok) return reply(200, { ok: true, report: result.data });
    if (result.code === "DEUX_FACTEURS_REQUIS")
      return reply(403, { ok: false, confirm: true, message: staffErrorMessage(result.code) });
    if (result.code === "INDISPONIBLE" && mode === "import")
      return reply(503, {
        ok: false,
        message:
          "Le serveur a mis trop de temps à répondre : l'import a peut-être eu lieu. Vérifiez de nouveau le fichier (les produits déjà importés sont signalés) avant de recommencer.",
      });
    return reply(result.code === "SESSION_INVALIDE" ? 401 : 422, {
      ok: false,
      message: staffErrorMessage(result.code, result.retryAfterSeconds),
    });
  } finally {
    inFlight -= 1;
  }
}
