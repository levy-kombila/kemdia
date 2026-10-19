/**
 * Port public du module audit : la SEULE porte d'entrée pour les autres modules (ADR-0006, règle 1).
 * Écrire : `AuditLog.record(...)` dans la transaction de l'action. Lire : `AuditReader` (administration).
 */
export { AuditModule } from "./audit.module.js";
export { AuditLog, AuditReader, AUDIT_PAGE_MAX } from "./application/audit-log.js";
export type { AuditCursor, AuditQuery } from "./application/ports.js";
export {
  AUDIT_ACTIONS,
  AUDIT_RETENTION_DAYS,
  NO_REQUEST,
  type AuditAction,
  type AuditActor,
  type AuditContext,
  type AuditEntry,
  type AuditEvent,
  type AuditTarget,
} from "./domain/audit-event.js";
export { auditContextOf } from "./interface/request-context.js";
/** Lignes du journal d'un compte, pour sa copie de données (S7-T08) */
export { AuditPersonalData } from "./infrastructure/audit-personal-data.js";
