import { isInvoiceNumber, isOrderReference } from "@/lib/orders/api-orders";
import { ordersApi, sessionToken } from "@/lib/orders/orders";

/**
 * Téléchargement d'une facture ou d'un avoir (S5-T07, ADR-0029) : le serveur du site relaie le PDF de l'API avec le
 * jeton de session du cookie `HttpOnly`. L'API ne rend que les factures des commandes du compte connecté (sinon 404),
 * et le site revérifie la forme des numéros avant tout appel. Jamais mis en cache (document personnel).
 */
const PRIVATE = {
  "cache-control": "private, no-store",
  "x-content-type-options": "nosniff",
} as const;

function text(status: number, message: string): Response {
  return new Response(message, {
    status,
    headers: { ...PRIVATE, "content-type": "text/plain; charset=utf-8" },
  });
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ reference: string; numero: string }> },
): Promise<Response> {
  const { reference, numero } = await params;
  if (!isOrderReference(reference) || !isInvoiceNumber(numero)) {
    return text(404, "Facture introuvable.");
  }
  const token = await sessionToken();
  if (!token) return text(401, "Connectez-vous pour télécharger vos factures.");
  const result = await ordersApi().invoicePdf(token, reference, numero);
  if (!result.ok) {
    switch (result.code) {
      case "SESSION_INVALIDE":
        return text(401, "Votre session a expiré : reconnectez-vous.");
      case "FACTURE_INTROUVABLE":
      case "COMMANDE_INTROUVABLE":
        return text(404, "Facture introuvable.");
      case "TROP_DE_REQUETES":
        return text(429, "Trop de demandes d'un coup : patientez une minute.");
      default:
        return text(503, "Le service ne répond pas pour le moment. Réessayez dans un instant.");
    }
  }
  return new Response(result.data, {
    status: 200,
    headers: {
      ...PRIVATE,
      "content-type": "application/pdf",
      // Nom de fichier sûr : le numéro a été vérifié (KMD-F-2026-000001)
      "content-disposition": `attachment; filename="${numero}.pdf"`,
      "content-length": String(result.data.byteLength),
    },
  });
}
