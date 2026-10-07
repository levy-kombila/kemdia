/**
 * Point de contrôle de santé, utilisé par :
 * - le healthcheck Docker (le conteneur est « healthy » seulement s'il répond) ;
 * - le test de fumée du pipeline CD (vérifie que la bonne version est en ligne
 *   et, pour la démo, que le catalogue vient bien de l'API : `catalog`, S3-T07).
 * Ne renvoie aucune information sensible (ni adresse de l'API, ni clé).
 */
export const dynamic = "force-dynamic";

export function GET() {
  return Response.json(
    {
      status: "ok",
      version: process.env.APP_VERSION ?? "dev",
      environment: process.env.APP_ENV ?? "local",
      // Toujours « api » depuis le S3-T08 (mode fichier retiré) ; gardé pour le contrôle de la démo dans la CI
      catalog: "api",
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
