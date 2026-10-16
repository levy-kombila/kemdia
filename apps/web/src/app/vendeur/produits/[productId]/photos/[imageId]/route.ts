import { sessionToken, vendorApi } from "@/lib/vendor/vendor";

/**
 * Aperçu d'une photo d'un produit du vendeur (S6-T06) : le serveur du site la demande à l'API avec le jeton de session,
 * quel que soit le statut du produit (même en attente de modération). Seul un WebP vérifié est relayé ; jamais en cache.
 * Sans session, refusée ou inconnue : la même réponse 404.
 */
const HEADERS = {
  "x-content-type-options": "nosniff",
  "cache-control": "private, no-store",
  "cross-origin-resource-policy": "same-origin",
  "referrer-policy": "no-referrer",
} as const;

const text = (status: number, message: string) =>
  new Response(message, {
    status,
    headers: { ...HEADERS, "content-type": "text/plain; charset=utf-8" },
  });

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ productId: string; imageId: string }> },
): Promise<Response> {
  const { productId, imageId } = await params;
  const token = await sessionToken();
  if (!token) return text(404, "Photo introuvable.");
  const result = await vendorApi().image(token, productId, imageId);
  if (result.status === 200)
    return new Response(result.bytes, {
      status: 200,
      headers: {
        ...HEADERS,
        "content-type": "image/webp",
        "content-length": String(result.bytes.byteLength),
      },
    });
  return result.status === 404
    ? text(404, "Photo introuvable.")
    : text(503, "Photo momentanément indisponible.");
}
