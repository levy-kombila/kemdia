import { Injectable } from "@nestjs/common";
import { TransactionContext } from "../../../database/transaction-context.js";
import type { Prisma } from "../../../generated/prisma/client.js";
import type {
  ListingCorrectionRecord,
  ListingCorrectionRepository,
  ListingCursor,
} from "../application/ports.js";

const withListing = {
  listing: { select: { title: true, slug: true } },
} satisfies Prisma.ListingCorrectionInclude;

type Row = Prisma.ListingCorrectionGetPayload<{ include: typeof withListing }>;

function toRecord(row: Row): ListingCorrectionRecord {
  return {
    id: row.id,
    listingId: row.listingId,
    listingTitle: row.listing.title,
    listingSlug: row.listing.slug,
    shopId: row.shopId,
    message: row.message,
    createdAt: row.createdAt,
    closedBy: row.closedBy,
    closedAt: row.closedAt,
    note: row.note,
  };
}

/**
 * Propositions de correction des fiches (S7.5-T03). Les écritures rejoignent la transaction en cours, ouverte par le
 * module vendors avec le journal d'audit.
 */
@Injectable()
export class PrismaListingCorrectionRepository implements ListingCorrectionRepository {
  constructor(private readonly tx: TransactionContext) {}

  async insert(record: Omit<ListingCorrectionRecord, "listingTitle" | "listingSlug">) {
    await this.tx.db.listingCorrection.create({ data: { ...record } });
  }

  async findById(id: string): Promise<ListingCorrectionRecord | null> {
    const row = await this.tx.db.listingCorrection.findUnique({
      where: { id },
      include: withListing,
    });
    return row ? toRecord(row) : null;
  }

  async lockById(id: string): Promise<ListingCorrectionRecord | null> {
    const rows = await this.tx.db.$queryRaw<{ id: string }[]>`
      SELECT "id" FROM "catalog"."listing_corrections" WHERE "id" = ${id}::uuid FOR UPDATE`;
    return rows[0] ? this.findById(id) : null;
  }

  async countOpen(shopId: string): Promise<number> {
    // Verrou de la boutique pour la transaction : deux envois simultanés ne dépassent pas la limite ensemble
    if (this.tx.active) {
      await this.tx.db
        .$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`correction:${shopId}`}, 0))`;
    }
    return this.tx.db.listingCorrection.count({ where: { shopId, closedAt: null } });
  }

  async list(query: {
    open: boolean;
    listingId?: string | undefined;
    limit: number;
    after?: ListingCursor | undefined;
  }): Promise<{ items: ListingCorrectionRecord[]; next: ListingCursor | null }> {
    // Ouvertes : la plus ancienne d'abord (file d'attente) ; closes : la plus récente d'abord
    const [cmp, dir] = query.open ? (["gt", "asc"] as const) : (["lt", "desc"] as const);
    const rows = await this.tx.db.listingCorrection.findMany({
      where: {
        closedAt: query.open ? null : { not: null },
        ...(query.listingId ? { listingId: query.listingId } : {}),
        ...(query.after
          ? {
              OR: [
                { createdAt: { [cmp]: query.after.at } },
                { createdAt: query.after.at, id: { [cmp]: query.after.id } },
              ],
            }
          : {}),
      },
      orderBy: [{ createdAt: dir }, { id: dir }],
      take: query.limit + 1,
      include: withListing,
    });
    const items = rows.slice(0, query.limit).map(toRecord);
    const last = rows[query.limit - 1];
    return {
      items,
      next: rows.length > query.limit && last ? { at: last.createdAt, id: last.id } : null,
    };
  }

  async close(id: string, by: string, note: string | null, now: Date): Promise<void> {
    await this.tx.db.listingCorrection.update({
      where: { id },
      data: { closedBy: by, closedAt: now, note },
    });
  }
}
