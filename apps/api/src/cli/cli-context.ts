import { Module, type Type } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { ThrottlerModule } from "@nestjs/throttler";
import { ConfigModule } from "../config/config.module.js";
import type { AppConfig } from "../config/env.js";
import { DatabaseModule } from "../database/database.module.js";
import { throttlerOptions } from "../http/rate-limit.js";
import { IdentityModule } from "../modules/identity/index.js";

/**
 * Contexte Nest des commandes serveur (`admin:grant`, `admin:revoke`, `mfa:reset`) : seulement ce qu'il faut pour le
 * module identité — ni HTTP, ni documentation.
 *
 * - `ThrottlerModule` : depuis le S4-T07, le garde de session du module identité dépend du stockage des limites de
 *   débit. Sans lui, Nest refuse de démarrer.
 * - `abortOnError: false` : par défaut, Nest arrête le processus (code 1) en cas d'erreur au démarrage, et comme les
 *   journaux sont coupés, la commande mourait SANS AUCUN MESSAGE (constaté le 2026-10-16 sur la démo). L'erreur
 *   remonte maintenant à la commande, qui affiche un message clair.
 */
export async function openIdentityCli<T>(
  config: AppConfig,
  service: Type<T>,
): Promise<{ service: T; close(): Promise<void> }> {
  @Module({
    imports: [
      ConfigModule.forRoot(config),
      ThrottlerModule.forRoot(throttlerOptions(config)),
      DatabaseModule,
      IdentityModule,
    ],
  })
  class IdentityCliModule {}

  const app = await NestFactory.createApplicationContext(IdentityCliModule, {
    logger: false,
    abortOnError: false,
  });
  return { service: app.get(service, { strict: false }), close: () => app.close() };
}

/**
 * Message d'échec au démarrage : type d'erreur et début du message, avec toute adresse « //utilisateur:motdepasse@ »
 * masquée (même filet que `database-health.ts`). Un module manquant se voit donc tel quel, au lieu d'accuser la base.
 */
export function startupFailure(problem: unknown): string {
  const name = problem instanceof Error ? problem.name : "erreur inconnue";
  const detail = (problem instanceof Error ? problem.message : String(problem))
    .replace(/[a-z][a-z0-9+.-]*:\/\/[^\s]*/gi, "<adresse masquée>")
    .replace(/\/\/[^@\s/]*@/g, "//***@")
    .split("\n")[0]!
    .slice(0, 200);
  return `Échec au démarrage : ${name}${detail ? ` (${detail})` : ""}. Adresse DATABASE_URL complète et base à jour (migrations) ?`;
}
