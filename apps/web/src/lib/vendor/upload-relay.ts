import "server-only";
import { SESSION_TOKEN_PATTERN } from "@kemdia/contracts/constants";
import { cookies } from "next/headers";
import { SESSION_COOKIE, expiredCookieOptions } from "@/lib/auth/cookies";
import { forgetSession, getCurrentAccount } from "@/lib/auth/session";
import { readAtMost } from "@/lib/orders/api-orders";
import type { VendorResult } from "./api-vendor";
import { MAX_UPLOAD_BYTES, sniffUploadType, type UploadType } from "./images";
import { vendorErrorMessage, type VendorMessageCode } from "./messages";
import { sessionToken } from "./vendor";

/**
 * Relais d'un envoi de photo vers l'API (S6-T06, commun aux photos de produits et au dossier de vérification, S6-T08).
 * Corps = le fichier (déjà réduit dans le navigateur), lu en flux, 5 Mo au plus, sans formulaire multipart.
 *
 * - Requête d'un autre site : refusée avant d'arriver ici (`proxy.ts`, en-tête `Origin`) ; corps borné à 6 Mo par
 *   le proxy Caddy.
 * - Session vérifiée AVANT de lire le corps, et 4 envois à la fois au plus pour ce serveur (relecture de sécurité :
 *   un faux cookie ne doit pas suffire à faire lire des Mo en mémoire).
 * - Type reconnu par les premiers octets (JPEG, PNG, WebP), jamais par le nom ni le type annoncé.
 * - L'API refait tout (rôle, boutique active, décodage, réencodage).
 */
const HEADERS = { "cache-control": "no-store", "x-content-type-options": "nosniff" } as const;
/** Envois lus en même temps au plus (≈ 4 × 5 Mo de mémoire) ; au-delà : 503, le vendeur réessaie. */
const MAX_CONCURRENT_UPLOADS = 4;
let inFlight = 0;

type Reply = { ok: true } | { ok: false; message: string; signedOut?: true };
function reply(status: number, body: Reply) {
  return Response.json(body, { status, headers: HEADERS });
}

async function signedOut(token: string | null): Promise<Response> {
  if (token) {
    forgetSession(token);
    (await cookies()).set(SESSION_COOKIE, "", expiredCookieOptions());
  }
  return reply(401, {
    ok: false,
    message: vendorErrorMessage("SESSION_INVALIDE"),
    signedOut: true,
  });
}

export async function relayUpload(
  request: Request,
  send: (
    token: string,
    bytes: Uint8Array<ArrayBuffer>,
    type: UploadType,
  ) => Promise<VendorResult<unknown>>,
): Promise<Response> {
  const token = await sessionToken();
  if (!token || !SESSION_TOKEN_PATTERN.test(token)) return signedOut(null);
  // Session réelle (mémoire de 10 s du site) avant de lire le moindre octet du corps
  if ((await getCurrentAccount()).status !== "signed-in") return signedOut(token);

  // Taille annoncée trop grande : refusé sans rien lire ; sinon lu en flux et arrêté au-delà de 5 Mo
  const announced = Number(request.headers.get("content-length"));
  if (Number.isFinite(announced) && announced > MAX_UPLOAD_BYTES)
    return reply(413, { ok: false, message: vendorErrorMessage("IMAGE_TROP_GRANDE") });
  if (inFlight >= MAX_CONCURRENT_UPLOADS)
    return reply(503, {
      ok: false,
      message: "beaucoup d'envois en ce moment, réessayez dans quelques secondes.",
    });

  inFlight += 1;
  try {
    const bytes = await readAtMost(new Response(request.body), MAX_UPLOAD_BYTES).catch(() => null);
    if (!bytes) return reply(413, { ok: false, message: vendorErrorMessage("IMAGE_TROP_GRANDE") });
    const type = sniffUploadType(bytes);
    if (!type)
      return reply(415, { ok: false, message: vendorErrorMessage("FORMAT_IMAGE_INVALIDE") });

    const result = await send(token, bytes, type);
    if (result.ok) return reply(200, { ok: true });
    if (result.code === "SESSION_INVALIDE") return signedOut(token);
    if (result.code === "INDISPONIBLE")
      // Délai dépassé : l'API a pu terminer l'ajout malgré tout (pas de doublon : vérifier avant de renvoyer)
      return reply(503, {
        ok: false,
        message:
          "le serveur a mis trop de temps à répondre. La photo a peut-être été reçue : rechargez la page avant de la renvoyer.",
      });
    return reply(422, {
      ok: false,
      message: vendorErrorMessage(result.code as VendorMessageCode, result.detail),
    });
  } finally {
    inFlight -= 1;
  }
}
