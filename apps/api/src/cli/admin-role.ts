import "reflect-metadata";
import { existsSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { ConfigError, loadConfig, type AppConfig } from "../config/env.js";
import { openIdentityCli, startupFailure } from "./cli-context.js";
import { IdentityError, RoleService } from "../modules/identity/index.js";

/**
 * Commande serveur : accorder ou retirer le rôle ADMINISTRATEUR (S4-T06, ADR-0020).
 *
 *   pnpm --filter @kemdia/api admin:grant  <e-mail ou téléphone>
 *   pnpm --filter @kemdia/api admin:revoke <e-mail ou téléphone>
 *   (image Docker : node dist/cli/admin-role.js grant <identifiant>)
 *
 * - C'est la SEULE façon de créer un administrateur : aucun mot de passe par défaut, aucun secret dans Git.
 *   Il faut déjà avoir accès à la base (DATABASE_URL) : c'est cet accès qui prouve qu'on est l'exploitant.
 * - Le compte doit exister et être vérifié (inscription normale par code, BR-041).
 * - Chaque changement est inscrit au journal d'audit, au nom du serveur (« system »).
 * - Rien n'est affiché de la configuration ; seul l'UUID du compte est écrit.
 */

export type RoleCommand = "grant" | "revoke";

export interface AdminRoleOptions {
  argv: readonly string[];
  env: NodeJS.ProcessEnv;
  log?: (message: string) => void;
  error?: (message: string) => void;
  /** Remplacé dans les tests (pas de base) */
  openService?: (
    config: AppConfig,
  ) => Promise<{ service: AdminRoleService; close(): Promise<void> }>;
}

export type AdminRoleService = Pick<RoleService, "grantAdminFromServer" | "revokeAdminFromServer">;

const USAGE = "Usage : admin-role grant|revoke <adresse e-mail ou mobile gabonais>";

/** Contexte Nest commun aux commandes serveur (`cli-context.ts`). */
function openNestService(config: AppConfig) {
  return openIdentityCli(config, RoleService);
}

/** Exécute la commande et renvoie le code de sortie (0 = réussite). */
export async function runAdminRole({
  argv,
  env,
  log = console.log,
  error = console.error,
  openService = openNestService,
}: AdminRoleOptions): Promise<number> {
  const [command, identifier, ...extra] = argv;
  if ((command !== "grant" && command !== "revoke") || !identifier || extra.length > 0) {
    error(USAGE);
    return 2;
  }

  let config: AppConfig;
  try {
    config = loadConfig(env);
  } catch (problem) {
    if (problem instanceof ConfigError) {
      error(problem.message);
      return 1;
    }
    throw problem;
  }

  let opened: Awaited<ReturnType<typeof openService>>;
  try {
    opened = await openService(config);
  } catch (problem) {
    // Avant : Nest arrêtait le processus sans aucun message (2026-10-16)
    error(startupFailure(problem));
    return 1;
  }
  const service = opened.service;
  try {
    const result =
      command === "grant"
        ? await service.grantAdminFromServer(identifier)
        : await service.revokeAdminFromServer(identifier);
    const what = command === "grant" ? "accordé au" : "retiré du";
    log(
      result.changed
        ? `Rôle administrateur ${what} compte ${result.accountId} (inscrit au journal d'audit).`
        : `Rien à faire : le compte ${result.accountId} ${command === "grant" ? "est déjà" : "n'est pas"} administrateur.`,
    );
    return 0;
  } catch (problem) {
    if (problem instanceof IdentityError) {
      error(`Refusé : ${problem.message} (${problem.code}).`);
      return 1;
    }
    // Jamais le détail (il pourrait contenir l'adresse de la base) : seulement le type d'erreur
    error(
      `Échec : ${problem instanceof Error ? problem.name : "erreur inconnue"}. Base joignable et à jour (migrations) ?`,
    );
    return 1;
  } finally {
    await opened.close();
  }
}

// Lancement direct, pas lors d'un import par les tests
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  // Comme l'API : le fichier .env ne sert qu'au poste de développement
  if (process.env.NODE_ENV !== "production" && existsSync(".env")) process.loadEnvFile(".env");
  process.exitCode = await runAdminRole({ argv: process.argv.slice(2), env: process.env });
}
