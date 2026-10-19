import { sessionToken } from "@/lib/orders/orders";
import { privacyApi } from "@/lib/privacy/privacy";

/**
 * Téléchargement de « mes données » (S7-T08, droit d'accès et portabilité) : le serveur du site relaie la copie JSON
 * de l'API avec le jeton de session du cookie `HttpOnly`. Le contenu est revérifié par le contrat, puis remis en
 * forme lisible. Jamais mis en cache (document personnel).
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

export async function GET(): Promise<Response> {
  const token = await sessionToken();
  if (!token) return text(401, "Connectez-vous pour télécharger vos données.");
  const result = await privacyApi().exportData(token);
  if (!result.ok) {
    switch (result.code) {
      case "SESSION_INVALIDE":
        return text(401, "Votre session a expiré : reconnectez-vous.");
      case "TROP_DE_REQUETES":
        return text(429, "Trop de demandes d'un coup : patientez une minute.");
      default:
        return text(503, "Le service ne répond pas pour le moment. Réessayez dans un instant.");
    }
  }
  const day = result.data.generatedAt.slice(0, 10);
  return new Response(`${JSON.stringify(result.data, null, 2)}\n`, {
    status: 200,
    headers: {
      ...PRIVATE,
      "content-type": "application/json; charset=utf-8",
      "content-disposition": `attachment; filename="kemdia-mes-donnees-${day}.json"`,
    },
  });
}
