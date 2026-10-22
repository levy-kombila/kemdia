import { INVOICE_NUMBER_PATTERN } from "@kemdia/contracts/constants";
import { redirect } from "next/navigation";
import { sessionToken, staffApi } from "@/lib/staff/staff";

/**
 * PDF d'une facture ou d'un avoir pour la Finance (S7.5-T05, ADR-0052) : le serveur du site le demande à l'API avec le
 * jeton du membre ; l'API vérifie le rôle et la double authentification, et inscrit le téléchargement au journal
 * d'audit. Jamais gardé en cache ; seul un PDF vérifié (signature, taille) est relayé.
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
  request: Request,
  { params }: { params: Promise<{ number: string }> },
): Promise<Response> {
  const { number } = await params;
  // Lien venu d'un autre site : refusé, sans rien demander à l'API (pas de fausse ligne au journal — relecture)
  const site = request.headers.get("sec-fetch-site");
  if (site && site !== "same-origin" && site !== "none") return text(404, "Facture introuvable.");
  const token = await sessionToken();
  // Sans session, refusée ou numéro mal formé : même réponse qu'une facture absente (l'espace ne se signale pas)
  if (!token || !INVOICE_NUMBER_PATTERN.test(number)) return text(404, "Facture introuvable.");
  const result = await staffApi().invoicePdf(token, number);
  switch (result.status) {
    case 200:
      return new Response(result.bytes, {
        status: 200,
        headers: {
          ...HEADERS,
          "content-type": "application/pdf",
          "content-disposition": `attachment; filename="${number}.pdf"`,
          "content-length": String(result.bytes.byteLength),
        },
      });
    case 403:
      // Session sans double authentification récente (ou sans le rôle) : la page de confirmation décide
      redirect("/equipe/confirmer?retour=%2Fequipe%2Ffactures");
    case 404:
      return text(404, "Facture introuvable.");
    case 503:
      return text(503, "Facture momentanément indisponible.");
  }
}
