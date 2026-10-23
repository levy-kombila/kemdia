import { Injectable } from "@nestjs/common";
import { TransactionContext } from "../../../database/transaction-context.js";
import type { Prisma } from "../../../generated/prisma/client.js";
import type { ProblemCursor, ProblemRepository } from "../application/ports.js";
import type { ProblemCategory, ProblemReport, ProblemStatus } from "../domain/problem-report.js";

type Row = Prisma.ProblemReportGetPayload<object>;
type DbCategory = Row["category"];
type DbStatus = Row["status"];

const CATEGORY_FROM_DB: Record<DbCategory, ProblemCategory> = {
  BUG: "bug",
  DISPLAY: "display",
  PAYMENT: "payment",
  DELIVERY: "delivery",
  OTHER: "other",
};
const CATEGORY_TO_DB: Record<ProblemCategory, DbCategory> = {
  bug: "BUG",
  display: "DISPLAY",
  payment: "PAYMENT",
  delivery: "DELIVERY",
  other: "OTHER",
};
const STATUS_FROM_DB: Record<DbStatus, ProblemStatus> = {
  NEW: "new",
  IN_PROGRESS: "in_progress",
  RESOLVED: "resolved",
};
const STATUS_TO_DB: Record<ProblemStatus, DbStatus> = {
  new: "NEW",
  in_progress: "IN_PROGRESS",
  resolved: "RESOLVED",
};

function toReport(row: Row): ProblemReport {
  return {
    ...row,
    category: CATEGORY_FROM_DB[row.category],
    status: STATUS_FROM_DB[row.status],
  };
}

/** Signalements (schéma `feedback`, S8-T02). Les écritures et lectures rejoignent la transaction en cours. */
@Injectable()
export class PrismaProblemRepository implements ProblemRepository {
  constructor(private readonly tx: TransactionContext) {}

  async create(report: ProblemReport): Promise<void> {
    await this.tx.db.problemReport.create({
      data: {
        ...report,
        category: CATEGORY_TO_DB[report.category],
        status: STATUS_TO_DB[report.status],
      },
    });
  }

  async findById(id: string): Promise<ProblemReport | null> {
    const row = await this.tx.db.problemReport.findUnique({ where: { id } });
    return row ? toReport(row) : null;
  }

  async saveIfUnchanged(report: ProblemReport, version: Date): Promise<boolean> {
    const { count } = await this.tx.db.problemReport.updateMany({
      where: { id: report.id, updatedAt: version },
      data: {
        status: STATUS_TO_DB[report.status],
        handledBy: report.handledBy,
        updatedAt: report.updatedAt,
      },
    });
    return count === 1;
  }

  countOpen(accountId: string): Promise<number> {
    return this.tx.db.problemReport.count({
      where: { accountId, status: { not: "RESOLVED" } },
    });
  }

  async list(query: {
    status: ProblemStatus;
    limit: number;
    after?: ProblemCursor | undefined;
  }): Promise<{ items: ProblemReport[]; next: ProblemCursor | null }> {
    const { after } = query;
    const rows = await this.tx.db.problemReport.findMany({
      where: {
        status: STATUS_TO_DB[query.status],
        ...(after
          ? {
              OR: [
                { createdAt: { gt: after.createdAt } },
                { createdAt: after.createdAt, id: { gt: after.id } },
              ],
            }
          : {}),
      },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      take: query.limit + 1,
    });
    const items = rows.slice(0, query.limit).map(toReport);
    const last = items.at(-1);
    return {
      items,
      next: rows.length > query.limit && last ? { createdAt: last.createdAt, id: last.id } : null,
    };
  }

  async ofAccount(accountId: string): Promise<ProblemReport[]> {
    const rows = await this.tx.db.problemReport.findMany({
      where: { accountId },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    });
    return rows.map(toReport);
  }

  async deleteOfAccount(accountId: string): Promise<number> {
    const { count } = await this.tx.db.problemReport.deleteMany({ where: { accountId } });
    return count;
  }

  async purgeResolvedBefore(date: Date): Promise<number> {
    const { count } = await this.tx.db.problemReport.deleteMany({
      where: { status: "RESOLVED", updatedAt: { lt: date } },
    });
    return count;
  }
}
