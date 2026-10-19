import { catalogSource } from "@/lib/config/server-config";
import { createDeepHealth } from "@/lib/health/deep-health";

/**
 * Point de contrôle de santé, utilisé par :
 * - le healthcheck Docker (le conteneur est « healthy » seulement s'il répond) ;
 * - le test de fumée du pipeline CD (vérifie que la bonne version est en ligne
 *   et, pour la démo, que le catalogue vient bien de l'API : `catalog`, S3-T07).
 * Ne renvoie aucune information sensible (ni adresse de l'API, ni clé).
 *
 * `?complet=1` (S7-T06, ADR-0045) : vérifie aussi l'API et sa base (sonde externe UptimeRobot, surveillance du
 * serveur) ; 503 si l'une des deux est en panne. Résultat gardé 10 s.
 */
export const dynamic = "force-dynamic";

let deepHealth: ReturnType<typeof createDeepHealth> | undefined;

export async function GET(request: Request) {
  const base = {
    status: "ok",
    version: process.env.APP_VERSION ?? "dev",
    environment: process.env.APP_ENV ?? "local",
    // Toujours « api » depuis le S3-T08 (mode fichier retiré) ; gardé pour le contrôle de la démo dans la CI
    catalog: "api",
  };
  const headers = { "Cache-Control": "no-store" };
  if (!new URL(request.url).searchParams.has("complet")) return Response.json(base, { headers });

  deepHealth ??= createDeepHealth({ url: catalogSource().url });
  const deep = await deepHealth();
  return Response.json(
    { ...base, status: deep.status, checks: deep.checks },
    { status: deep.status === "ok" ? 200 : 503, headers },
  );
}
