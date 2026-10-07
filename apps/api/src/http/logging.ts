import { randomUUID } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";
import type { Params } from "nestjs-pino";
import type { AppConfig } from "../config/env.js";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Identifiant de requête : celui du relais (Caddy) s'il est bien formé, sinon un nouveau UUID. */
export function requestId(req: IncomingMessage): string {
  const header = req.headers["x-request-id"];
  return typeof header === "string" && UUID.test(header) ? header : randomUUID();
}

/** Chemin sans la chaîne de requête : `?q=…` peut contenir un numéro de téléphone ou un e-mail. */
export function pathOnly(url: string | undefined): string {
  return (url ?? "/").split("?")[0] ?? "/";
}

/**
 * Journaux au format JSON (une ligne par événement), lisibles par n'importe quel outil de surveillance.
 * Règle : **aucune donnée personnelle** — ni corps de requête, ni en-têtes, ni paramètres d'URL, ni adresse IP complète.
 */
export function loggerParams(config: AppConfig): Params {
  return {
    pinoHttp: {
      level: config.LOG_LEVEL,
      base: { service: "kemdia-api", version: config.APP_VERSION, env: config.APP_ENV },
      genReqId: (req, res) => {
        const id = requestId(req);
        res.setHeader("X-Request-Id", id);
        return id;
      },
      // Le contrôle de santé est appelé toutes les 30 s : on ne le journalise pas
      autoLogging: { ignore: (req) => pathOnly(req.url) === "/api/health" },
      customLogLevel: (_req, res, error) =>
        error || res.statusCode >= 500 ? "error" : res.statusCode >= 400 ? "warn" : "info",
      serializers: {
        req: (req: IncomingMessage & { id?: string }) => ({
          id: req.id,
          method: req.method,
          path: pathOnly(req.url),
        }),
        res: (res: ServerResponse) => ({ statusCode: res.statusCode }),
      },
      // Filet de sécurité si un développeur journalise un objet sensible par erreur
      redact: {
        paths: [
          "password",
          "*.password",
          "token",
          "*.token",
          "otp",
          "*.otp",
          "ticket",
          "*.ticket",
          "passwordHash",
          "*.passwordHash",
          '["api-key"]',
          '*["api-key"]',
          "authorization",
          "*.authorization",
          "cookie",
          "*.cookie",
          "phone",
          "*.phone",
          "email",
          "*.email",
        ],
        censor: "[masqué]",
      },
      transport:
        config.NODE_ENV === "development"
          ? { target: "pino-pretty", options: { singleLine: true, translateTime: "HH:MM:ss" } }
          : undefined,
    },
  };
}
