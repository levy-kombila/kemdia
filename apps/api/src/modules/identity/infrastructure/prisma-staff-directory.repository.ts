import { Injectable } from "@nestjs/common";
import { TransactionContext } from "../../../database/transaction-context.js";
import type { Prisma } from "../../../generated/prisma/client.js";
import type { StoredRole } from "../domain/role.js";
import type { StaffCursor, StaffDirectory, StaffRecord } from "../application/ports.js";
import { ROLE_TO_DB, WITH_ROLES, toDomain } from "./prisma-account.repository.js";

/**
 * Équipe et statut des comptes (S7.5-T04, ADR-0051). Les écritures rejoignent la transaction en cours : le statut,
 * les sessions fermées et la ligne du journal d'audit vont ensemble.
 */
@Injectable()
export class PrismaStaffDirectory implements StaffDirectory {
  constructor(private readonly tx: TransactionContext) {}

  async list(query: {
    roles: readonly StoredRole[];
    limit: number;
    after?: StaffCursor | undefined;
  }): Promise<{ items: StaffRecord[]; next: StaffCursor | null }> {
    const after = query.after;
    const where: Prisma.AccountWhereInput = {
      deletedAt: null,
      roles: { some: { role: { in: query.roles.map((r) => ROLE_TO_DB[r]) } } },
      ...(after
        ? {
            OR: [
              { lastName: { gt: after.lastName } },
              { lastName: after.lastName, firstName: { gt: after.firstName } },
              { lastName: after.lastName, firstName: after.firstName, id: { gt: after.id } },
            ],
          }
        : {}),
    };
    const rows = await this.tx.db.account.findMany({
      where,
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }, { id: "asc" }],
      take: query.limit + 1,
      include: { ...WITH_ROLES, secondFactor: { select: { enabledAt: true } } },
    });
    const items = rows.slice(0, query.limit).map((row) => ({
      account: toDomain(row),
      secondFactorEnabled: row.secondFactor?.enabledAt != null,
      lastActiveAt: row.lastActiveAt,
    }));
    const last = rows[query.limit - 1];
    return {
      items,
      next:
        rows.length > query.limit && last
          ? { lastName: last.lastName, firstName: last.firstName, id: last.id }
          : null,
    };
  }

  async lock(accountId: string) {
    if (!this.tx.active) throw new Error("verrou d'un compte hors transaction");
    const rows = await this.tx.db.$queryRaw<{ id: string }[]>`
      SELECT "id" FROM "identity"."accounts" WHERE "id" = ${accountId}::uuid FOR UPDATE`;
    if (!rows[0]) return null;
    const row = await this.tx.db.account.findUniqueOrThrow({
      where: { id: accountId },
      include: WITH_ROLES,
    });
    return { account: toDomain(row), deleted: row.deletedAt !== null };
  }

  async setStatus(accountId: string, status: "active" | "disabled", now: Date): Promise<void> {
    await this.tx.db.account.update({
      where: { id: accountId },
      data: { status: status === "active" ? "ACTIVE" : "DISABLED", updatedAt: now },
    });
  }

  async activity(accountId: string) {
    const row = await this.tx.db.account.findUnique({
      where: { id: accountId },
      select: { lastActiveAt: true, emailVerifiedAt: true, phoneVerifiedAt: true },
    });
    return row
      ? {
          lastActiveAt: row.lastActiveAt,
          emailVerified: row.emailVerifiedAt !== null,
          phoneVerified: row.phoneVerifiedAt !== null,
        }
      : null;
  }
}
