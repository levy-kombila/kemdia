/**
 * Journal du serveur du site (S7-T06, ADR-0045).
 *
 * - En production : **une ligne JSON par événement**, au même format que l'API (pino) — `level` (30 info, 40
 *   avertissement, 50 erreur), `time` (ms), `service`, `version`, `env`, `scope`, `msg`. Lisible par `docker logs`,
 *   `jq` et n'importe quel outil de surveillance ; un retour à la ligne glissé dans un message ne peut pas fabriquer une
 *   fausse ligne de journal (il est échappé).
 * - Ailleurs (développement, tests) : le texte habituel `[scope] message`, plus lisible.
 *
 * Règle inchangée : **aucune donnée personnelle** dans un message (ni e-mail, ni téléphone, ni valeur reçue) — seulement
 * la route, le statut et la nature du problème.
 */

export type LogLevel = "info" | "warn" | "error";

const LEVELS: Record<LogLevel, number> = { info: 30, warn: 40, error: 50 };

type Env = Record<string, string | undefined>;

/** Ligne écrite pour un événement (exportée pour les tests). */
export function formatLog(
  level: LogLevel,
  scope: string,
  message: string,
  env: Env = process.env,
  now: () => number = Date.now,
): string {
  if (env.NODE_ENV !== "production") return `[${scope}] ${message}`;
  return JSON.stringify({
    level: LEVELS[level],
    time: now(),
    service: "kemdia-web",
    version: env.APP_VERSION ?? "dev",
    env: env.APP_ENV ?? "local",
    scope,
    msg: message,
  });
}

/** Journal du serveur du site : `log.error("catalogue", "/products : API injoignable")`. */
export const log = {
  info: (scope: string, message: string) => console.log(formatLog("info", scope, message)),
  warn: (scope: string, message: string) => console.warn(formatLog("warn", scope, message)),
  error: (scope: string, message: string) => console.error(formatLog("error", scope, message)),
};
