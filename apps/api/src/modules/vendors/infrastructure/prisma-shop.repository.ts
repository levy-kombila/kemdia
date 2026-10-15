import { Injectable } from "@nestjs/common";
import { TransactionContext } from "../../../database/transaction-context.js";
import type { Prisma } from "../../../generated/prisma/client.js";
import type { ShopCursor, ShopRepository } from "../application/ports.js";
import type { Shop, ShopKind, ShopStatus } from "../domain/shop.js";

type ShopRow = Prisma.ShopGetPayload<object>;
type DbStatus = ShopRow["status"];

const STATUS_FROM_DB: Record<DbStatus, ShopStatus> = {
  PENDING: "pending",
  ACTIVE: "active",
  REJECTED: "rejected",
  SUSPENDED: "suspended",
};
const STATUS_TO_DB: Record<ShopStatus, DbStatus> = {
  pending: "PENDING",
  active: "ACTIVE",
  rejected: "REJECTED",
  suspended: "SUSPENDED",
};

function toShop(row: ShopRow): Shop {
  return {
    id: row.id,
    kind: (row.kind === "KEMDIA" ? "kemdia" : "partner") satisfies ShopKind,
    ownerAccountId: row.ownerAccountId,
    name: row.name,
    nameKey: row.nameKey,
    slug: row.slug,
    city: row.city,
    contactPhone: row.contactPhone,
    description: row.description,
    status: STATUS_FROM_DB[row.status],
    statusReason: row.statusReason,
    reviewedBy: row.reviewedBy,
    reviewedAt: row.reviewedAt,
    submittedAt: row.submittedAt,
    createdAt: row.createdAt,
  };
}

/** Champs qu'une demande ou une décision peut changer (jamais l'identifiant, le type ni le propriétaire). */
function mutable(shop: Shop, now: Date) {
  return {
    name: shop.name,
    nameKey: shop.nameKey,
    slug: shop.slug,
    city: shop.city,
    contactPhone: shop.contactPhone,
    description: shop.description,
    status: STATUS_TO_DB[shop.status],
    statusReason: shop.statusReason,
    reviewedBy: shop.reviewedBy,
    reviewedAt: shop.reviewedAt,
    submittedAt: shop.submittedAt,
    updatedAt: now,
  };
}

function isUniqueViolation(error: unknown): boolean {
  const code = (error as { code?: unknown } | null)?.code;
  const meta = (error as { meta?: { driverAdapterError?: { cause?: { originalCode?: unknown } } } })
    ?.meta;
  return code === "P2002" || meta?.driverAdapterError?.cause?.originalCode === "23505";
}

/**
 * Boutiques (schéma `vendors`, S6-T01). Les écritures rejoignent la transaction en cours : boutique, rôle vendeur et
 * journal d'audit sont écrits ensemble ou pas du tout. Les contraintes SQL de la migration doublent les règles du domaine.
 */
@Injectable()
export class PrismaShopRepository implements ShopRepository {
  constructor(private readonly tx: TransactionContext) {}

  async findById(id: string): Promise<Shop | null> {
    const row = await this.tx.db.shop.findUnique({ where: { id } });
    return row ? toShop(row) : null;
  }

  async findByOwner(accountId: string): Promise<Shop | null> {
    const row = await this.tx.db.shop.findUnique({ where: { ownerAccountId: accountId } });
    return row ? toShop(row) : null;
  }

  async lockById(id: string): Promise<Shop | null> {
    const rows = await this.tx.db.$queryRaw<{ id: string }[]>`
      SELECT "id" FROM "vendors"."shops" WHERE "id" = ${id}::uuid FOR UPDATE`;
    return rows[0] ? this.findById(rows[0].id) : null;
  }

  async lockOwner(accountId: string): Promise<void> {
    // Verrou consultatif propre à la transaction, libéré à sa fin ; l'espace « vendors.shop_owner » évite de croiser
    // un autre verrou consultatif de l'application.
    await this.tx.db.$executeRaw`
      SELECT pg_advisory_xact_lock(hashtext('vendors.shop_owner'), hashtext(${accountId}))`;
  }

  async isNameTaken(nameKey: string, exceptId?: string): Promise<boolean> {
    const row = await this.tx.db.shop.findUnique({ where: { nameKey }, select: { id: true } });
    return row !== null && row.id !== exceptId;
  }

  async isSlugTaken(slug: string, exceptId?: string): Promise<boolean> {
    const row = await this.tx.db.shop.findUnique({ where: { slug }, select: { id: true } });
    return row !== null && row.id !== exceptId;
  }

  async insert(shop: Shop, now: Date): Promise<boolean> {
    try {
      await this.tx.db.shop.create({
        data: {
          id: shop.id,
          kind: shop.kind === "kemdia" ? "KEMDIA" : "PARTNER",
          ownerAccountId: shop.ownerAccountId,
          createdAt: shop.createdAt,
          ...mutable(shop, now),
        },
      });
      return true;
    } catch (error) {
      if (isUniqueViolation(error)) return false;
      throw error;
    }
  }

  async update(shop: Shop, now: Date): Promise<boolean> {
    try {
      const { count } = await this.tx.db.shop.updateMany({
        where: { id: shop.id },
        data: mutable(shop, now),
      });
      return count === 1;
    } catch (error) {
      if (isUniqueViolation(error)) return false;
      throw error;
    }
  }

  async list(query: {
    status?: ShopStatus | undefined;
    limit: number;
    after?: ShopCursor | undefined;
  }): Promise<{ items: Shop[]; next: ShopCursor | null }> {
    const where: Prisma.ShopWhereInput = {
      ...(query.status ? { status: STATUS_TO_DB[query.status] } : {}),
      ...(query.after
        ? {
            OR: [
              { submittedAt: { gt: query.after.submittedAt } },
              { submittedAt: query.after.submittedAt, id: { gt: query.after.id } },
            ],
          }
        : {}),
    };
    const rows = await this.tx.db.shop.findMany({
      where,
      orderBy: [{ submittedAt: "asc" }, { id: "asc" }],
      take: query.limit + 1,
    });
    const items = rows.slice(0, query.limit).map(toShop);
    const last = items.at(-1);
    return {
      items,
      next:
        rows.length > query.limit && last ? { submittedAt: last.submittedAt, id: last.id } : null,
    };
  }
}
