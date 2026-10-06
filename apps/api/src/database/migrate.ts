import { spawn, type ChildProcess, type SpawnOptions } from "node:child_process";
import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";
import { ConfigError, loadConfig } from "../config/env.js";

/**
 * Applique les migrations de la base (S3-T06) : `node dist/database/migrate.js`.
 *
 * C'est l'outil officiel de Prisma (`prisma migrate deploy`) qui fait le travail : il applique dans l'ordre
 * les dossiers de `prisma/migrations` encore absents de la table `_prisma_migrations`, sous un verrou PostgreSQL
 * (deux lancements simultanés ne peuvent pas se gêner), et ne fait rien si la base est à jour.
 *
 * Ce script ajoute, autour de lui, les règles de l'API :
 * - la configuration est vérifiée **comme au démarrage de l'API** (même message, même code 1) :
 *   en production, l'adresse de développement est refusée ;
 * - aucune valeur n'est affichée (l'adresse de la base contient un mot de passe) ;
 * - aucun appel à Internet : vérification de mise à jour de Prisma désactivée ;
 * - au-delà de `MIGRATION_TIMEOUT_MS`, l'opération est interrompue (code 1).
 *
 * Utilisé par l'image Docker (tâche ponctuelle lancée AVANT la nouvelle version de l'API) et par la CI.
 */

/** Une migration plus longue est anormale pour ce projet : on l'interrompt plutôt que de bloquer un déploiement. */
export const MIGRATION_TIMEOUT_MS = 10 * 60_000;

/** Dossier de l'API (contient `prisma.config.ts`) : `apps/api` dans le dépôt, `/app` dans l'image. */
export const API_ROOT = fileURLToPath(new URL("../..", import.meta.url));

type Spawn = (command: string, args: readonly string[], options: SpawnOptions) => ChildProcess;

export interface MigrateOptions {
  env: NodeJS.ProcessEnv;
  spawn?: Spawn;
  log?: (message: string) => void;
  error?: (message: string) => void;
  timeoutMs?: number;
}

/** Chemin du programme de Prisma (dépendance de production de l'API). */
export function prismaCli(): string {
  return createRequire(import.meta.url).resolve("prisma/build/index.js");
}

/** Lance `prisma migrate deploy` et renvoie le code de sortie à utiliser (0 = base à jour). */
export async function runMigrations({
  env,
  spawn: spawnImpl = spawn,
  log = console.log,
  error = console.error,
  timeoutMs = MIGRATION_TIMEOUT_MS,
}: MigrateOptions): Promise<number> {
  let config;
  try {
    config = loadConfig(env);
  } catch (problem) {
    if (problem instanceof ConfigError) {
      error(problem.message);
      return 1;
    }
    throw problem;
  }

  log(`Migrations de la base : version ${config.APP_VERSION} (${config.APP_ENV})…`);
  const child = spawnImpl(process.execPath, [prismaCli(), "migrate", "deploy"], {
    cwd: API_ROOT,
    stdio: "inherit",
    env: {
      ...env,
      // Valeur déjà validée (y compris la valeur par défaut du poste de développement)
      DATABASE_URL: config.DATABASE_URL,
      // Aucune requête vers les serveurs de Prisma (vérification de mise à jour, statistiques)
      CHECKPOINT_DISABLE: "1",
      PRISMA_HIDE_UPDATE_MESSAGE: "1",
    },
  });

  return new Promise<number>((resolve) => {
    const timer = setTimeout(() => {
      error(`Migrations interrompues : plus de ${Math.round(timeoutMs / 60_000)} min.`);
      child.kill("SIGTERM");
    }, timeoutMs);
    child.on("error", () => {
      clearTimeout(timer);
      error("Migrations impossibles : l'outil Prisma n'a pas pu être lancé.");
      resolve(1);
    });
    child.on("exit", (code) => {
      clearTimeout(timer);
      if (code === 0) {
        log("Migrations de la base : terminées, la base est à jour.");
        resolve(0);
      } else {
        error(
          "Migrations de la base : ÉCHEC (voir les messages ci-dessus). La nouvelle version ne doit pas démarrer.",
        );
        resolve(1);
      }
    });
  });
}

// Lancement direct (`node dist/database/migrate.js`), pas lors d'un import par les tests
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  // Comme l'API : le fichier .env ne sert qu'au poste de développement
  if (process.env.NODE_ENV !== "production" && existsSync(".env")) process.loadEnvFile(".env");
  process.exitCode = await runMigrations({ env: process.env });
}
