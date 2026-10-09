import { Injectable } from "@nestjs/common";
import { TransactionContext } from "../../../database/transaction-context.js";
import type { AuditEvent as AuditRow, Prisma } from "../../../generated/prisma/client.js";
import {
  AUDIT_ACTIONS,
  AUDIT_TARGET_TYPES,
  type AuditAction,
  type AuditDetails,
  type AuditEntry,
  type AuditEvent,
  type AuditTargetType,
} from "../domain/audit-event.js";
import type { AuditQuery, AuditRepository } from "../application/ports.js";

function details(value: Prisma.JsonValue): AuditDetails {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(
    Object.entries(value).filter(
      (entry): entry is [string, string | number] =>
        typeof entry[1] === "string" || typeof entry[1] === "number",
    ),
  );
}

function toDomain(row: AuditRow): AuditEvent {
  const targetType = AUDIT_TARGET_TYPES.find((t) => t === row.targetType);
  return {
    id: row.id,
    occurredAt: row.occurredAt,
    // Contrainte SQL + liste fermée : une action inconnue viendrait d'une version plus récente de l'API
    action: (AUDIT_ACTIONS.find((a) => a === row.action) ?? row.action) as AuditAction,
    actor:
      row.actorType === "ACCOUNT" && row.actorId
        ? { type: "account", id: row.actorId }
        : { type: "system" },
    target:
      targetType && row.targetId
        ? { type: targetType satisfies AuditTargetType, id: row.targetId }
        : null,
    details: details(row.details),
    context: { ip: row.ip, requestId: row.requestId },
  };
}

/** Journal d'audit dans PostgreSQL (schéma `audit`, table en ajout seul). */
@Injectable()
export class PrismaAuditRepository implements AuditRepository {
  constructor(private readonly tx: TransactionContext) {}

  async append(id: string, entry: AuditEntry): Promise<void> {
    await this.tx.db.auditEvent.create({
      data: {
        id,
        // occurred_at : posé par la base (déclencheur), la valeur par défaut suffit
        action: entry.action,
        actorType: entry.actor.type === "account" ? "ACCOUNT" : "SYSTEM",
        actorId: entry.actor.type === "account" ? entry.actor.id : null,
        targetType: entry.target?.type ?? null,
        targetId: entry.target?.id ?? null,
        details: { ...entry.details },
        ip: entry.context.ip,
        requestId: entry.context.requestId,
      },
    });
  }

  async list(query: AuditQuery): Promise<AuditEvent[]> {
    const where: Prisma.AuditEventWhereInput[] = [];
    if (query.action) where.push({ action: query.action });
    if (query.accountId)
      where.push({ OR: [{ actorId: query.accountId }, { targetId: query.accountId }] });
    if (query.before) {
      const { occurredAt, id } = query.before;
      where.push({
        OR: [{ occurredAt: { lt: occurredAt } }, { occurredAt, id: { lt: id } }],
      });
    }
    const rows = await this.tx.db.auditEvent.findMany({
      where: { AND: where },
      orderBy: [{ occurredAt: "desc" }, { id: "desc" }],
      take: query.limit,
    });
    return rows.map(toDomain);
  }

  purgeExpired(batch: number): Promise<number> {
    // Même expression que le déclencheur SQL (horloge de la base) : jamais de refus pour une ligne limite
    return this.tx.db.$executeRaw`
      DELETE FROM "audit"."events"
      WHERE "id" IN (
        SELECT "id" FROM "audit"."events"
        WHERE "occurred_at" < CURRENT_TIMESTAMP - INTERVAL '365 days'
        ORDER BY "occurred_at"
        LIMIT ${batch}
      )`;
  }
}
