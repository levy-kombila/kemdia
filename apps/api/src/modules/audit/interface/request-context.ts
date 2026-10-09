import type { Request } from "express";
import { clientOf, normalizeIp } from "../../../http/client.js";
import type { AuditContext } from "../domain/audit-event.js";

const REQUEST_ID = /^[\w.-]{1,64}$/;

/**
 * Contexte d'une requête HTTP pour le journal d'audit :
 * - l'adresse IP du visiteur transmise par le site (S4-T07, crue seulement avec la clé interne), sinon celle
 *   vue par l'API (`req.ip`) ; sans réglage CLIENT_IP_HEADER sur le site, c'est l'adresse du serveur du site ;
 * - l'identifiant de requête des journaux techniques (pour retrouver la ligne correspondante).
 */
export function auditContextOf(req: Request): AuditContext {
  const client = clientOf(req);
  const ip = client && client.ip !== "inconnue" ? client.ip : normalizeIp(req.ip);
  const id: unknown = (req as Request & { id?: unknown }).id;
  const requestId = typeof id === "string" && REQUEST_ID.test(id) ? id : null;
  return { ip, requestId };
}
