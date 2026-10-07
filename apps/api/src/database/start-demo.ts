import { pathToFileURL } from "node:url";
import { runDemoImport } from "./demo-import.js";
import { runMigrations } from "./migrate.js";

/**
 * Démarrage de la démo Render (S3-T07) : `node dist/database/start-demo.js`, réglé comme « Docker Command » du service.
 *
 *   1. migrations de la base   (même script que la tâche ponctuelle du S3-T06)
 *   2. import du catalogue de démonstration (relançable, sans doublon)
 *   3. l'API                   (dist/main.js)
 *
 * Pourquoi ici et pas avant le déploiement ? Sur l'offre gratuite de Render, la « commande avant déploiement »
 * n'existe pas (ADR-0013). La démo n'a qu'une instance : deux migrations simultanées sont impossibles
 * (et Prisma pose de toute façon un verrou PostgreSQL).
 *
 * Refusé partout sauf `APP_ENV=demo` : en staging ou en production, les migrations restent une tâche séparée
 * lancée AVANT l'API (ADR-0012), et le catalogue de démonstration n'a rien à y faire.
 * Si une étape échoue, l'API ne démarre pas (code 1) : Render garde l'ancienne version en service.
 */

export interface StartDemoSteps {
  migrate: () => Promise<number>;
  importDemo: () => Promise<number>;
  startApi: () => Promise<unknown>;
}

export async function startDemo(
  env: NodeJS.ProcessEnv,
  steps: StartDemoSteps,
  error: (message: string) => void = console.error,
): Promise<number> {
  if (env.APP_ENV !== "demo") {
    error(
      "Démarrage de démonstration refusé : APP_ENV doit valoir « demo ». " +
        "En staging et en production, lancer les migrations à part puis node dist/main.js (ADR-0012).",
    );
    return 1;
  }
  if ((await steps.migrate()) !== 0) return 1;
  if ((await steps.importDemo()) !== 0) return 1;
  await steps.startApi();
  return 0;
}

// Lancement direct (`node dist/database/start-demo.js`), pas lors d'un import par les tests
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const env = process.env;
  const code = await startDemo(env, {
    migrate: () => runMigrations({ env }),
    importDemo: () => runDemoImport({ env, allowedEnvs: ["demo"] }),
    // L'API se lance à l'import de son point d'entrée
    startApi: () => import("../main.js"),
  });
  if (code !== 0) process.exit(code);
}
