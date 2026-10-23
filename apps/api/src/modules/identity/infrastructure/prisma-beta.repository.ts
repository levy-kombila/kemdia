import { Injectable } from "@nestjs/common";
import { TransactionContext } from "../../../database/transaction-context.js";
import type { Prisma } from "../../../generated/prisma/client.js";
import type { BetaInvitationCursor, BetaRepository } from "../application/ports.js";
import type {
  BetaInvitation,
  BetaInvitationKind,
  BetaSettings,
} from "../domain/beta-invitation.js";

type Row = Prisma.BetaInvitationGetPayload<object>;
type DbKind = Row["kind"];

const FROM_DB: Record<DbKind, BetaInvitationKind> = {
  PARTNER_VENDOR: "partner_vendor",
  TESTER: "tester",
};
const TO_DB: Record<BetaInvitationKind, DbKind> = {
  partner_vendor: "PARTNER_VENDOR",
  tester: "TESTER",
};
/** Ligne unique du réglage (contrainte SQL `id = 1`). */
const SETTINGS_ID = 1;

function toInvitation(row: Row): BetaInvitation {
  return { ...row, kind: FROM_DB[row.kind] };
}

/** Bêta fermée (schéma `identity`, S8-T02). Les écritures rejoignent la transaction en cours. */
@Injectable()
export class PrismaBetaRepository implements BetaRepository {
  constructor(private readonly tx: TransactionContext) {}

  async settings(): Promise<BetaSettings> {
    const row = await this.tx.db.betaSettings.findUnique({ where: { id: SETTINGS_ID } });
    // Ligne absente (base plus ancienne que la migration) : inscription ouverte, comme avant
    if (!row) return { closed: false, updatedBy: null, updatedAt: null };
    // Jamais changé par personne (ligne de la migration) : pas de date à montrer
    return {
      closed: row.closed,
      updatedBy: row.updatedBy,
      updatedAt: row.updatedBy ? row.updatedAt : null,
    };
  }

  async saveSettings(closed: boolean, updatedBy: string, now: Date): Promise<BetaSettings> {
    const row = await this.tx.db.betaSettings.upsert({
      where: { id: SETTINGS_ID },
      create: { id: SETTINGS_ID, closed, updatedBy, updatedAt: now },
      update: { closed, updatedBy, updatedAt: now },
    });
    return { closed: row.closed, updatedBy: row.updatedBy, updatedAt: row.updatedAt };
  }

  async findByIdentifier(identifier: string): Promise<BetaInvitation | null> {
    const row = await this.tx.db.betaInvitation.findUnique({ where: { identifier } });
    return row ? toInvitation(row) : null;
  }

  async findById(id: string): Promise<BetaInvitation | null> {
    const row = await this.tx.db.betaInvitation.findUnique({ where: { id } });
    return row ? toInvitation(row) : null;
  }

  async save(invitation: BetaInvitation): Promise<void> {
    const data = {
      identifier: invitation.identifier,
      kind: TO_DB[invitation.kind],
      invitedBy: invitation.invitedBy,
      usedBy: invitation.usedBy,
      usedAt: invitation.usedAt,
      revokedAt: invitation.revokedAt,
      expiresAt: invitation.expiresAt,
      createdAt: invitation.createdAt,
    };
    // Par l'adresse (unique) : deux invitations simultanées de la même adresse donnent une seule ligne, pas une erreur
    await this.tx.db.betaInvitation.upsert({
      where: { identifier: invitation.identifier },
      create: { id: invitation.id, ...data },
      update: data,
    });
  }

  async markUsed(identifier: string, accountId: string, now: Date): Promise<boolean> {
    const { count } = await this.tx.db.betaInvitation.updateMany({
      where: { identifier, usedAt: null, revokedAt: null, expiresAt: { gt: now } },
      data: { usedAt: now, usedBy: accountId },
    });
    return count === 1;
  }

  async revoke(id: string, now: Date): Promise<boolean> {
    const { count } = await this.tx.db.betaInvitation.updateMany({
      where: { id, usedAt: null },
      data: { revokedAt: now },
    });
    return count === 1;
  }

  async list(
    limit: number,
    after?: BetaInvitationCursor,
  ): Promise<{ items: BetaInvitation[]; next: BetaInvitationCursor | null }> {
    const rows = await this.tx.db.betaInvitation.findMany({
      where: after
        ? {
            OR: [
              { createdAt: { lt: after.createdAt } },
              { createdAt: after.createdAt, id: { lt: after.id } },
            ],
          }
        : {},
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: limit + 1,
    });
    const items = rows.slice(0, limit).map(toInvitation);
    const last = items.at(-1);
    return {
      items,
      next: rows.length > limit && last ? { createdAt: last.createdAt, id: last.id } : null,
    };
  }
}
