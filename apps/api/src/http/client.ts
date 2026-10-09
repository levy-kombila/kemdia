import { isIP } from "node:net";
import type { NextFunction, Request, Response } from "express";
import { CLIENT_IP_HEADER } from "@kemdia/contracts/constants";
import type { AppConfig } from "../config/env.js";
import { INTERNAL_KEY_HEADER, isInternalKey } from "./internal-key.js";

/**
 * Qui appelle l'API (S4-T07, ADR-0021) — calculé UNE fois par requête, utilisé par les limites et le journal d'audit.
 *
 * - `viaSite` : le serveur du site s'est identifié avec la clé interne (comparée en temps constant).
 * - `ip` : l'adresse du VISITEUR si le site l'a transmise (`X-Kemdia-Client-IP`, crue SEULEMENT avec la clé) ;
 *   sinon `req.ip` (qui ne lit `X-Forwarded-For` qu'à travers les relais de TRUST_PROXY).
 * - `visitorKnown` : faux quand le site appelle sans dire pour quel visiteur (lecture du catalogue) :
 *   l'appel n'est alors pas limité par adresse (le site sert tout le monde depuis la même).
 */
export interface ApiClient {
  ip: string;
  viaSite: boolean;
  visitorKnown: boolean;
}

type RequestWithClient = Request & { kemdiaClient?: ApiClient };

/** IPv4 écrite à l'intérieur d'une IPv6 (« ::ffff:1.2.3.4ʺ) → « 1.2.3.4 ». */
export function normalizeIp(raw: string | undefined): string | null {
  if (!raw) return null;
  const value = raw.trim().toLowerCase();
  const ip = value.startsWith("::ffff:") && isIP(value.slice(7)) === 4 ? value.slice(7) : value;
  return isIP(ip) ? ip : null;
}

export function resolveClient(req: Request, config: AppConfig): ApiClient {
  const viaSite = isInternalKey(req.headers[INTERNAL_KEY_HEADER], config.API_INTERNAL_KEY);
  const fallback = normalizeIp(req.ip) ?? "inconnue";
  if (!viaSite) return { ip: fallback, viaSite, visitorKnown: true };
  const header = req.headers[CLIENT_IP_HEADER];
  const visitor = typeof header === "string" ? normalizeIp(header) : null;
  return visitor
    ? { ip: visitor, viaSite, visitorKnown: true }
    : { ip: fallback, viaSite, visitorKnown: false };
}

/** Intergiciel Express posé par configureApp, avant toute route. */
export function clientMiddleware(config: AppConfig) {
  return (req: Request, _res: Response, next: NextFunction) => {
    (req as RequestWithClient).kemdiaClient = resolveClient(req, config);
    next();
  };
}

/** Le client de cette requête (calculé à la volée si l'intergiciel n'est pas passé, ex. dans un test). */
export function clientOf(req: Request): ApiClient | undefined {
  return (req as RequestWithClient).kemdiaClient;
}
