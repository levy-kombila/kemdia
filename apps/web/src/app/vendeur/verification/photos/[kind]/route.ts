import { KYC_DOCUMENT_KINDS } from "@kemdia/contracts/constants";
import { vendorErrorMessage } from "@/lib/vendor/messages";
import { relayUpload } from "@/lib/vendor/upload-relay";
import { vendorApi } from "@/lib/vendor/vendor";

/**
 * Envoi d'une photo du dossier de vérification (S6-T08, ADR-0039) : `POST /vendeur/verification/photos/{sorte}`, corps
 * = le fichier. Mêmes contrôles que les photos de produits (`lib/vendor/upload-relay.ts`) ; l'API réencode puis chiffre.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ kind: string }> },
): Promise<Response> {
  const { kind } = await params;
  const known = KYC_DOCUMENT_KINDS.find((k) => k === kind);
  if (!known)
    return Response.json(
      { ok: false, message: vendorErrorMessage("DOCUMENT_INTROUVABLE") },
      { status: 404, headers: { "cache-control": "no-store" } },
    );
  return relayUpload(request, (token, bytes, type) =>
    vendorApi().uploadKycDocument(token, known, bytes, type),
  );
}
