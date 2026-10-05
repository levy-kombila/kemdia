/**
 * Point de contrôle de santé, utilisé par :
 * - le healthcheck Docker (le conteneur est « healthy » seulement s'il répond) ;
 * - le test de fumée du pipeline CD (vérifie que la bonne version est en ligne).
 * Ne renvoie aucune information sensible.
 */
export const dynamic = "force-dynamic";

export function GET() {
  return Response.json(
    {
      status: "ok",
      version: process.env.APP_VERSION ?? "dev",
      environment: process.env.APP_ENV ?? "local",
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
