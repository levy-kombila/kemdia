import { randomUUID } from "node:crypto";
import { Inject, Injectable } from "@nestjs/common";
import { assertValidEntry, type AuditEntry, type AuditEvent } from "../domain/audit-event.js";
import { AUDIT_REPOSITORY, type AuditQuery, type AuditRepository } from "./ports.js";

export const AUDIT_PAGE_MAX = 100;

/**
 * Écriture dans le journal d'audit, pour tous les modules (port public).
 * À appeler DANS la transaction de l'action (TransactionRunner du module) : si l'écriture échoue,
 * l'action est annulée — pas d'action sensible sans trace.
 */
@Injectable()
export class AuditLog {
  constructor(@Inject(AUDIT_REPOSITORY) private readonly events: AuditRepository) {}

  async record(entry: AuditEntry): Promise<void> {
    assertValidEntry(entry);
    await this.events.append(randomUUID(), entry);
  }
}

/** Lecture du journal (route d'administration). */
@Injectable()
export class AuditReader {
  constructor(@Inject(AUDIT_REPOSITORY) private readonly events: AuditRepository) {}

  list(query: AuditQuery): Promise<AuditEvent[]> {
    // Une ligne de plus que la page permise : l'appelant sait ainsi s'il reste une page suivante
    const limit = Math.min(Math.max(Math.trunc(query.limit), 1), AUDIT_PAGE_MAX + 1);
    return this.events.list({ ...query, limit });
  }
}
