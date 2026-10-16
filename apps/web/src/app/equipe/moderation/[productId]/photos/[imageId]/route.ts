import { sessionToken, staffApi } from "@/lib/staff/staff";

/**
 * Photo d'un produit à modérer (S6-T05, ADR-0036) : le serveur du site la demande à l'API avec le jeton de session du
 * modérateur ; l'API vérifie le rôle et la double authentification à CHAQUE photo (ADR-0035). Rien n'est gardé en cache
 * (ni navigateur, ni intermédiaire) et seul un WebP vérifié est relayé.
 */
const HEADERS = {
  "x-content-type-options": "nosniff",
  "cache-control": "private, no-store",
  "cross-origin-resource-policy": "same-origin",
  "referrer-policy": "no-referrer",
} as const;

function text(status: number, message: string): Response {
  return new Response(message, {
    status,
    headers: { ...HEADERS, "content-type": "text/plain; charset=utf-8" },
  });
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ productId: string; imageId: string }> },
): Promise<Response> {
  const { productId, imageId } = await params;
  const token = await sessionToken();
  // Sans session ou refusée : même réponse qu'une photo inconnue (l'espace ne se signale pas, relecture S6-T05)
  if (!token) return text(404, "Photo introuvable.");
  const result = await staffApi().moderationImage(token, productId, imageId);
  switch (result.status) {
    case 200:
      return new Response(result.bytes, {
        status: 200,
        headers: {
          ...HEADERS,
          "content-type": "image/webp",
          "content-length": String(result.bytes.byteLength),
        },
      });
    case 403:
    case 404:
      return text(404, "Photo introuvable.");
    case 503:
      return text(503, "Photo momentanément indisponible.");
  }
}
