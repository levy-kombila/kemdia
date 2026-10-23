import { cookies } from "next/headers";
import { createAvatarApi } from "@/lib/auth/api-avatar";
import { SESSION_COOKIE } from "@/lib/auth/cookies";
import { forgetSession } from "@/lib/auth/session";
import { catalogSource } from "@/lib/config/server-config";
import { readAtMost } from "@/lib/orders/api-orders";
import { UNKNOWN_VISITOR, clientIpHeaderName, visitorIp } from "@/lib/security/client-ip";
import { MAX_UPLOAD_BYTES, sniffUploadType } from "@/lib/vendor/images";

/**
 * Photo de profil (S7.5-T08, ADR-0055) : `/compte/photo` (voir), `POST` (envoyer, corps = le fichier), `DELETE`
 * (retirer). Toujours la photo du compte CONNECTÉ (jamais d'identifiant dans l'adresse). Les requêtes qui modifient
 * passent par le contrôle d'origine du site (proxy.ts) ; la session est vérifiée par l'API.
 */
const NO_STORE = { "cache-control": "no-store", "x-content-type-options": "nosniff" } as const;
/** Envois lus en même temps au plus (≈ 4 × 5 Mo de mémoire). */
const MAX_CONCURRENT_UPLOADS = 4;
let inFlight = 0;

const MESSAGES = {
  SESSION_INVALIDE: "Votre session a expiré : reconnectez-vous.",
  PHOTO_INVALIDE:
    "Photo refusée : JPEG, PNG ou WebP de 5 Mo au plus, 200 pixels au moins de chaque côté.",
  PHOTO_ABSENTE: "Vous n'avez pas de photo de profil.",
  TROP_DE_REQUETES: "Trop d'envois : patientez une minute.",
  INDISPONIBLE: "Service momentanément indisponible. Réessayez dans quelques instants.",
} as const;
const STATUS = {
  SESSION_INVALIDE: 401,
  PHOTO_INVALIDE: 422,
  PHOTO_ABSENTE: 404,
  TROP_DE_REQUETES: 429,
  INDISPONIBLE: 503,
} as const;

async function context(request: Request) {
  const token = (await cookies()).get(SESSION_COOKIE)?.value ?? null;
  // Même règle que les autres relais connectés : sans réglage, pas d'adresse (la limite par compte s'applique)
  const ipHeader = clientIpHeaderName();
  const ip = ipHeader ? (visitorIp(request.headers, ipHeader) ?? UNKNOWN_VISITOR) : null;
  return { token, api: createAvatarApi({ ...catalogSource(), visitorIp: ip }) };
}

function reply(status: number, body: object) {
  return Response.json(body, { status, headers: NO_STORE });
}

export async function GET(request: Request): Promise<Response> {
  const { token, api } = await context(request);
  if (!token) return new Response(null, { status: 404, headers: NO_STORE });
  const result = await api.read(token, request.headers.get("if-none-match"));
  if (!result.ok) return new Response(null, { status: STATUS[result.code], headers: NO_STORE });
  // Adresse versionnée (?v=…) qui correspond à la photo servie : gardée UNE JOURNÉE par le navigateur du titulaire
  // seulement (jamais par un relais partagé ; pas plus longtemps sur un poste partagé). Version périmée ou absente :
  // revalidée à chaque fois (relecture de sécurité).
  const wanted = new URL(request.url).searchParams.get("v");
  const current = result.data.etag.slice(1, 17);
  const cache = wanted && wanted === current ? "private, max-age=86400" : "private, no-cache";
  const headers = { ...NO_STORE, "cache-control": cache, etag: result.data.etag, vary: "Cookie" };
  if (result.data.notModified) return new Response(null, { status: 304, headers });
  return new Response(Buffer.from(result.data.bytes), {
    status: 200,
    headers: { ...headers, "content-type": "image/webp" },
  });
}

export async function POST(request: Request): Promise<Response> {
  const { token, api } = await context(request);
  if (!token) return reply(401, { ok: false, message: MESSAGES.SESSION_INVALIDE });
  const announced = Number(request.headers.get("content-length"));
  if (Number.isFinite(announced) && announced > MAX_UPLOAD_BYTES)
    return reply(413, { ok: false, message: MESSAGES.PHOTO_INVALIDE });
  if (inFlight >= MAX_CONCURRENT_UPLOADS)
    return reply(503, {
      ok: false,
      message: "Beaucoup d'envois en ce moment, réessayez dans quelques secondes.",
    });
  inFlight += 1;
  try {
    const bytes = await readAtMost(new Response(request.body), MAX_UPLOAD_BYTES).catch(() => null);
    const type = bytes ? sniffUploadType(bytes) : null;
    if (!bytes || !type) return reply(422, { ok: false, message: MESSAGES.PHOTO_INVALIDE });
    const result = await api.upload(token, bytes, type);
    if (!result.ok)
      return reply(STATUS[result.code], { ok: false, message: MESSAGES[result.code] });
    // L'en-tête du site montre la nouvelle photo tout de suite (mémoire des sessions oubliée pour ce jeton)
    forgetSession(token);
    return reply(200, { ok: true, avatar: result.data.avatar });
  } finally {
    inFlight -= 1;
  }
}

export async function DELETE(request: Request): Promise<Response> {
  const { token, api } = await context(request);
  if (!token) return reply(401, { ok: false, message: MESSAGES.SESSION_INVALIDE });
  const result = await api.remove(token);
  if (!result.ok && result.code !== "PHOTO_ABSENTE")
    return reply(STATUS[result.code], { ok: false, message: MESSAGES[result.code] });
  forgetSession(token);
  return reply(200, { ok: true });
}
