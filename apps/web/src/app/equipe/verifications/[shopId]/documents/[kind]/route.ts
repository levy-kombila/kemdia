import { KYC_DOCUMENT_KINDS } from "@kemdia/contracts/constants";
import { sessionToken, staffApi } from "@/lib/staff/staff";

/**
 * Photo d'un dossier de vérification (S6-T08, ADR-0039) : le serveur du site la demande à l'API avec le jeton de
 * l'administrateur ; l'API vérifie le rôle et la double authentification, la déchiffre et inscrit la consultation au
 * journal d'audit. Jamais gardée en cache ; seul un WebP vérifié est relayé.
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
  { params }: { params: Promise<{ shopId: string; kind: string }> },
): Promise<Response> {
  const { shopId, kind } = await params;
  const known = KYC_DOCUMENT_KINDS.find((k) => k === kind);
  const token = await sessionToken();
  // Sans session, refusée ou sorte inconnue : même réponse qu'une photo absente (l'espace ne se signale pas)
  if (!token || !known) return text(404, "Photo introuvable.");
  const result = await staffApi().kycDocument(token, shopId, known);
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
