/**
 * Exécuté une fois, au démarrage du serveur Next.js (avant la première requête).
 * Vérifie la configuration du catalogue (S3-T05) : si elle est fausse — par exemple APP_ENV=production
 * sans API_URL — le serveur s'arrête aussitôt avec un message clair, au lieu de servir un site incohérent.
 */
export async function register() {
  // Pendant `next build`, la configuration d'exécution n'existe pas encore : rien à vérifier
  if (process.env.NEXT_PHASE === "phase-production-build") return;
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { checkConfigurationAtStartup } = await import("./lib/config/startup-check");
    checkConfigurationAtStartup();
  }
}
