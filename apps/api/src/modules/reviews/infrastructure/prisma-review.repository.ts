import { Injectable } from "@nestjs/common";
import { TransactionContext } from "../../../database/transaction-context.js";
import type { Prisma } from "../../../generated/prisma/client.js";
import type { ReviewCursor, ReviewRepository } from "../application/ports.js";
import type { Review, ReviewStatus, ReviewSummary } from "../domain/review.js";

type Row = Prisma.ReviewGetPayload<object>;
type DbStatus = Row["status"];

const FROM_DB: Record<DbStatus, ReviewStatus> = {
  PENDING: "pending",
  PUBLISHED: "published",
  REJECTED: "rejected",
};
const TO_DB: Record<ReviewStatus, DbStatus> = {
  pending: "PENDING",
  published: "PUBLISHED",
  rejected: "REJECTED",
};

function toReview(row: Row): Review {
  return { ...row, status: FROM_DB[row.status] };
}

/** Avis (schéma `reviews`, S8-T01). Les écritures et lectures rejoignent la transaction en cours. */
@Injectable()
export class PrismaReviewRepository implements ReviewRepository {
  constructor(private readonly tx: TransactionContext) {}

  async findMine(listingId: string, accountId: string): Promise<Review | null> {
    const row = await this.tx.db.review.findUnique({
      where: { listingId_accountId: { listingId, accountId } },
    });
    return row ? toReview(row) : null;
  }

  async lockById(id: string): Promise<Review | null> {
    const rows = await this.tx.db.$queryRaw<{ id: string }[]>`
      SELECT "id" FROM "reviews"."reviews" WHERE "id" = ${id}::uuid FOR UPDATE`;
    if (!rows[0]) return null;
    const row = await this.tx.db.review.findUnique({ where: { id: rows[0].id } });
    return row ? toReview(row) : null;
  }

  async save(review: Review): Promise<void> {
    const data = { ...review, status: TO_DB[review.status] };
    // L'auteur, la fiche, l'identifiant et la date de création ne changent jamais
    const changes = {
      rating: data.rating,
      comment: data.comment,
      authorName: data.authorName,
      status: data.status,
      rejectReason: data.rejectReason,
      reviewedBy: data.reviewedBy,
      reviewedAt: data.reviewedAt,
      updatedAt: data.updatedAt,
    };
    await this.tx.db.review.upsert({
      where: { listingId_accountId: { listingId: review.listingId, accountId: review.accountId } },
      create: data,
      update: changes,
    });
  }

  async delete(listingId: string, accountId: string): Promise<boolean> {
    const { count } = await this.tx.db.review.deleteMany({ where: { listingId, accountId } });
    return count > 0;
  }

  async published(
    listingId: string,
    page: number,
    pageSize: number,
  ): Promise<{ items: Review[]; total: number }> {
    const where = { listingId, status: "PUBLISHED" as const };
    const total = await this.tx.db.review.count({ where });
    const rows = await this.tx.db.review.findMany({
      where,
      orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
      skip: (page - 1) * pageSize,
      take: pageSize,
    });
    return { items: rows.map(toReview), total };
  }

  async summary(listingId: string): Promise<ReviewSummary> {
    const groups = await this.tx.db.review.groupBy({
      by: ["rating"],
      where: { listingId, status: "PUBLISHED" },
      _count: { _all: true },
    });
    const distribution: [number, number, number, number, number] = [0, 0, 0, 0, 0];
    for (const g of groups) {
      if (g.rating >= 1 && g.rating <= 5) distribution[g.rating - 1] = g._count._all;
    }
    const count = distribution.reduce((s, n) => s + n, 0);
    const total = distribution.reduce((s, n, i) => s + n * (i + 1), 0);
    return {
      count,
      average: count ? Math.round((total / count) * 10) / 10 : 0,
      distribution,
    };
  }

  async list(query: {
    status: ReviewStatus;
    limit: number;
    after?: ReviewCursor | undefined;
  }): Promise<{ items: Review[]; next: ReviewCursor | null }> {
    const after = query.after;
    const rows = await this.tx.db.review.findMany({
      where: {
        status: TO_DB[query.status],
        ...(after
          ? {
              OR: [
                { updatedAt: { gt: after.updatedAt } },
                { updatedAt: after.updatedAt, id: { gt: after.id } },
              ],
            }
          : {}),
      },
      orderBy: [{ updatedAt: "asc" }, { id: "asc" }],
      take: query.limit + 1,
    });
    const items = rows.slice(0, query.limit).map(toReview);
    const last = items.at(-1);
    return {
      items,
      next: rows.length > query.limit && last ? { updatedAt: last.updatedAt, id: last.id } : null,
    };
  }

  async ofAccount(accountId: string): Promise<Review[]> {
    const rows = await this.tx.db.review.findMany({
      where: { accountId },
      orderBy: { createdAt: "asc" },
    });
    return rows.map(toReview);
  }

  async deleteOfAccount(accountId: string): Promise<string[]> {
    const rows = await this.tx.db.review.findMany({
      where: { accountId },
      select: { listingId: true },
    });
    await this.tx.db.review.deleteMany({ where: { accountId } });
    return [...new Set(rows.map((r) => r.listingId))];
  }
}
