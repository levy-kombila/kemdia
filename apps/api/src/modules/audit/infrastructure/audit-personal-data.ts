import { Injectable } from "@nestjs/common";
import { TransactionContext } from "../../../database/transaction-context.js";

/** Lignes au plus dans la copie (le journal ne garde que 365 jours). */
const MAX_EVENTS = 5_000;

/**
 * Journal d'audit dans la copie des données (S7-T08, relecture : droit d'accès). Les actions du compte et celles qui
 * le visent : action et date ; l'adresse IP seulement pour SES propres actions (jamais celle d'un membre de
 * l'équipe), et jamais les détails (ils peuvent contenir des notes de l'équipe). Le journal n'est pas effacé avec le
 * compte : il est en ajout seul et se purge après 365 jours (ADR-0020).
 */
@Injectable()
export class AuditPersonalData {
  constructor(private readonly tx: TransactionContext) {}

  async export(accountId: string): Promise<Record<string, unknown>> {
    const rows = await this.tx.db.auditEvent.findMany({
      where: { OR: [{ actorId: accountId }, { targetId: accountId }] },
      select: { action: true, occurredAt: true, actorId: true, ip: true },
      orderBy: { occurredAt: "desc" },
      take: MAX_EVENTS,
    });
    return {
      evenements: rows.map((row) => ({
        action: row.action,
        date: row.occurredAt,
        parVous: row.actorId === accountId,
        ip: row.actorId === accountId ? row.ip : null,
      })),
    };
  }
}
