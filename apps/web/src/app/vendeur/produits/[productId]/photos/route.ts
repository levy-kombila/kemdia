import { isUuid } from "@/lib/vendor/images";
import { vendorErrorMessage } from "@/lib/vendor/messages";
import { relayUpload } from "@/lib/vendor/upload-relay";
import { vendorApi } from "@/lib/vendor/vendor";

/**
 * Envoi d'une photo de produit par le vendeur (S6-T06, ADR-0037) : `POST /vendeur/produits/{id}/photos`, corps = le
 * fichier. Contrôles communs (session avant lecture, 5 Mo, type lu dans les octets) : `lib/vendor/upload-relay.ts`.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ productId: string }> },
): Promise<Response> {
  const { productId } = await params;
  if (!isUuid(productId))
    return Response.json(
      { ok: false, message: vendorErrorMessage("PRODUIT_INTROUVABLE") },
      { status: 404, headers: { "cache-control": "no-store" } },
    );
  return relayUpload(request, (token, bytes, type) =>
    vendorApi().addImage(token, productId, bytes, type),
  );
}
