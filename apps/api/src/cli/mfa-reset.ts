import "reflect-metadata";
import { existsSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { ConfigError, loadConfig, type AppConfig } from "../config/env.js";
import { openIdentityCli, startupFailure } from "./cli-context.js";
import { IdentityError, SecondFactorService } from "../modules/identity/index.js";

/**
 * Commande serveur : remettre à zéro la double authentification d'un compte (S6-T03, ADR-0034) — téléphone ET codes
 * de secours perdus.
 *
 *   pnpm --filter @kemdia/api mfa:reset <e-mail ou téléphone>
 *   (image Docker : node dist/cli/mfa-reset.js <identifiant>)
 *
 * - Il faut l'accès à la base (DATABASE_URL) : c'est lui qui prouve qu'on est l'exploitant, comme pour admin:grant.
 *   Vérifier d'abord l'identité de la personne par un autre moyen (appel, en personne) : c'est la porte de secours.
 * - Toutes les sessions du compte sont fermées ET son mot de passe devient inutilisable : un voleur qui le connaîtrait
 *   ne peut pas se reconnecter pour inscrire son téléphone. Le titulaire choisit un nouveau mot de passe avec « Mot de
 *   passe oublié » (sa boîte e-mail), se reconnecte et réactive la double authentification.
 * - Inscrit au journal d'audit (« mfa.reset », au nom du serveur). Seul l'UUID du compte est affiché.
 */
export interface MfaResetOptions {
  argv: readonly string[];
  env: NodeJS.ProcessEnv;
  log?: (message: string) => void;
  error?: (message: string) => void;
  /** Remplacé dans les tests (pas de base) */
  openService?: (
    config: AppConfig,
  ) => Promise<{ service: MfaResetService; close(): Promise<void> }>;
}

export type MfaResetService = Pick<SecondFactorService, "resetFromServer">;

const USAGE = "Usage : mfa-reset <adresse e-mail ou mobile gabonais>";

/** Contexte Nest commun aux commandes serveur (`cli-context.ts`). */
function openNestService(config: AppConfig) {
  return openIdentityCli(config, SecondFactorService);
}

/** Exécute la commande et renvoie le code de sortie (0 = réussite). */
export async function runMfaReset({
  argv,
  env,
  log = console.log,
  error = console.error,
  openService = openNestService,
}: MfaResetOptions): Promise<number> {
  const [identifier, ...extra] = argv;
  if (!identifier || extra.length > 0) {
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
  try {
    const result = await opened.service.resetFromServer(identifier);
    log(
      result.changed
        ? `Double authentification remise à zéro pour le compte ${result.accountId} : sessions fermées, mot de passe à refaire avec « Mot de passe oublié » (inscrit au journal d'audit).`
        : `Rien à faire : le compte ${result.accountId} n'a pas de double authentification.`,
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
  if (process.env.NODE_ENV !== "production" && existsSync(".env")) process.loadEnvFile(".env");
  process.exitCode = await runMfaReset({ argv: process.argv.slice(2), env: process.env });
}
