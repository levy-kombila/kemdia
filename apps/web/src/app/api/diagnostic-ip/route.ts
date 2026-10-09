import { timingSafeEqual } from "node:crypto";
import { INTERNAL_KEY_HEADER } from "@kemdia/contracts/constants";
import { visitorIp } from "@/lib/security/client-ip";

/**
 * ⚠️ DIAGNOSTIC TEMPORAIRE (S4-T07) — À SUPPRIMER dans S4-T08, une fois `CLIENT_IP_HEADER` réglé sur la démo.
 *
 * Sert à vérifier, sur la démo Render, que l'en-tête `CF-Connecting-IP` contient bien la VRAIE adresse
 * du visiteur et qu'un visiteur ne peut pas l'inventer (Cloudflare doit écraser une valeur envoyée par le client).
 *
 * - Protégé par la clé interne (`X-Kemdia-Internal-Key`, comparée en temps constant) ; sinon 404, comme si la route
 *   n'existait pas.
 * - Ne renvoie QUE cet en-tête et l'adresse que le site en retiendrait ; aucun autre en-tête, rien n'est journalisé.
 * - Jamais mis en cache.
 */
const CANDIDATE = "cf-connecting-ip";

export const dynamic = "force-dynamic";

function hasInternalKey(received: string | null): boolean {
  const expected = process.env.API_INTERNAL_KEY;
  if (!expected || !received) return false;
  const a = Buffer.from(received);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

const noStore = { "Cache-Control": "no-store" };
const notFound = () => new Response(null, { status: 404, headers: noStore });

/** Autres méthodes : la même 404 que sans clé (la route ne se signale pas, relecture S4-T07) */
export const OPTIONS = notFound;
export const POST = notFound;

export function GET(request: Request): Response {
  if (!hasInternalKey(request.headers.get(INTERNAL_KEY_HEADER))) return notFound();
  return Response.json(
    {
      enTete: CANDIDATE,
      valeurRecue: request.headers.get(CANDIDATE),
      adresseRetenue: visitorIp(request.headers, CANDIDATE),
    },
    { headers: noStore },
  );
}
