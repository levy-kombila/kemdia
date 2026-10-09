import type { AuditQuery, AuditRepository } from "../../src/modules/audit/application/ports.js";
import type { AuditEntry, AuditEvent } from "../../src/modules/audit/index.js";

/** Journal d'audit en mémoire (la table en ajout seul est testée en intégration). */
export class InMemoryAuditEvents implements AuditRepository {
  readonly rows: AuditEvent[] = [];
  private tick = Date.parse("2026-10-08T10:00:00Z");

  append(id: string, entry: AuditEntry): Promise<void> {
    // Comme la base : la date est posée à l'écriture, jamais fournie par l'appelant
    this.rows.push({ ...entry, id, occurredAt: new Date((this.tick += 1_000)) });
    return Promise.resolve();
  }

  list(query: AuditQuery): Promise<AuditEvent[]> {
    const { before } = query;
    return Promise.resolve(
      [...this.rows]
        .sort((a, b) => b.occurredAt.getTime() - a.occurredAt.getTime() || b.id.localeCompare(a.id))
        .filter((e) => !query.action || e.action === query.action)
        .filter(
          (e) =>
            !query.accountId ||
            (e.actor.type === "account" && e.actor.id === query.accountId) ||
            e.target?.id === query.accountId,
        )
        .filter(
          (e) =>
            !before ||
            e.occurredAt < before.occurredAt ||
            (e.occurredAt.getTime() === before.occurredAt.getTime() && e.id < before.id),
        )
        .slice(0, query.limit),
    );
  }

  purgeExpired(): Promise<number> {
    return Promise.resolve(0);
  }
}
