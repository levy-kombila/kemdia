import { isIP } from "node:net";
import type { Request } from "express";
import type { AuditContext } from "../domain/audit-event.js";

const REQUEST_ID = /^[\w.-]{1,64}$/;

/**
 * Contexte d'une requête HTTP pour le journal d'audit :
 * - l'adresse IP vue par l'API (`req.ip` : X-Forwarded-For seulement à travers les relais de TRUST_PROXY) ;
 *   pour une action passée par le site, c'est l'adresse du serveur du site (adresse du visiteur : S4-T07) ;
 * - l'identifiant de requête des journaux techniques (pour retrouver la ligne correspondante).
 */
export function auditContextOf(req: Request): AuditContext {
  const raw = req.ip?.startsWith("::ffff:") ? req.ip.slice(7) : req.ip;
  const ip = raw && isIP(raw) ? raw : null;
  const id: unknown = (req as Request & { id?: unknown }).id;
  const requestId = typeof id === "string" && REQUEST_ID.test(id) ? id : null;
  return { ip, requestId };
}
