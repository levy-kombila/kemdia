import { Module } from "@nestjs/common";
import { AuditLog, AuditReader } from "./application/audit-log.js";
import { AUDIT_REPOSITORY } from "./application/ports.js";
import { AuditRetentionScheduler } from "./infrastructure/audit-retention.js";
import { PrismaAuditRepository } from "./infrastructure/prisma-audit.repository.js";

/**
 * Module audit (S4-T06, ADR-0020) : journal des actions sensibles, schéma PostgreSQL `audit`.
 * Aucune route : il est utilisé par les autres modules (écriture) et par les routes d'administration
 * du module identity (lecture). Il ne dépend d'aucun autre module.
 */
@Module({
  providers: [
    AuditLog,
    AuditReader,
    AuditRetentionScheduler,
    { provide: AUDIT_REPOSITORY, useClass: PrismaAuditRepository },
  ],
  exports: [AuditLog, AuditReader],
})
export class AuditModule {}
