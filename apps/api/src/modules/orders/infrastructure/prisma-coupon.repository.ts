import { randomUUID } from "node:crypto";
import { Injectable } from "@nestjs/common";
import { TransactionContext } from "../../../database/transaction-context.js";
import type { Prisma } from "../../../generated/prisma/client.js";
import type { CouponCursor, CouponRepository } from "../application/ports.js";
import type { Coupon, CouponKind, CouponRules } from "../domain/coupon.js";
import { postgresCode } from "./postgres-errors.js";

type CouponRow = Prisma.CouponGetPayload<object>;

const KIND_TO_DB = { percent: "PERCENT", fixed: "FIXED" } as const;

function toCoupon(row: CouponRow): Coupon {
  return {
    id: row.id,
    code: row.code,
    kind: (row.kind === "PERCENT" ? "percent" : "fixed") satisfies CouponKind,
    value: row.value,
    maxDiscount: row.maxDiscount,
    minSubtotal: row.minSubtotal,
    startsAt: row.startsAt,
    endsAt: row.endsAt,
    usageLimit: row.usageLimit,
    usedCount: row.usedCount,
    perAccountLimit: row.perAccountLimit,
    stackableWithSales: row.stackableWithSales,
    active: row.active,
    createdAt: row.createdAt,
  };
}

/**
 * Coupons (schéma `orders`, S5-T03). Les écritures rejoignent la transaction en cours : l'utilisation d'un coupon est
 * comptée avec la commande, ou pas du tout (BR-030). Le compteur ne dépasse jamais la limite (contrainte SQL en plus).
 */
@Injectable()
export class PrismaCouponRepository implements CouponRepository {
  constructor(private readonly tx: TransactionContext) {}

  async findByCode(code: string): Promise<Coupon | null> {
    const row = await this.tx.db.coupon.findUnique({ where: { code } });
    return row ? toCoupon(row) : null;
  }

  async findById(id: string): Promise<Coupon | null> {
    const row = await this.tx.db.coupon.findUnique({ where: { id } });
    return row ? toCoupon(row) : null;
  }

  async lockByCode(code: string): Promise<Coupon | null> {
    const db = this.tx.db;
    const rows = await db.$queryRaw<{ id: string }[]>`
      SELECT "id" FROM "orders"."coupons" WHERE "code" = ${code} FOR UPDATE`;
    if (!rows[0]) return null;
    return this.findById(rows[0].id);
  }

  countUses(couponId: string, accountId: string): Promise<number> {
    return this.tx.db.couponRedemption.count({
      where: { couponId, accountId, releasedAt: null },
    });
  }

  async redeem(use: {
    couponId: string;
    orderId: string;
    accountId: string;
    amount: number;
    now: Date;
  }): Promise<void> {
    const db = this.tx.db;
    await db.coupon.update({
      where: { id: use.couponId },
      data: { usedCount: { increment: 1 }, updatedAt: use.now },
    });
    await db.couponRedemption.create({
      data: {
        id: randomUUID(),
        couponId: use.couponId,
        orderId: use.orderId,
        accountId: use.accountId,
        amount: use.amount,
        createdAt: use.now,
      },
    });
  }

  async releaseForOrder(orderId: string, now: Date): Promise<void> {
    const db = this.tx.db;
    const use = await db.couponRedemption.findUnique({ where: { orderId } });
    if (!use || use.releasedAt) return;
    await db.couponRedemption.update({ where: { id: use.id }, data: { releasedAt: now } });
    await db.coupon.update({
      where: { id: use.couponId },
      data: { usedCount: { decrement: 1 }, updatedAt: now },
    });
  }

  async create(rules: CouponRules, createdBy: string, now: Date): Promise<Coupon | null> {
    try {
      const row = await this.tx.db.coupon.create({
        data: {
          id: randomUUID(),
          code: rules.code,
          kind: KIND_TO_DB[rules.kind],
          value: rules.value,
          maxDiscount: rules.maxDiscount,
          minSubtotal: rules.minSubtotal,
          startsAt: rules.startsAt,
          endsAt: rules.endsAt,
          usageLimit: rules.usageLimit,
          perAccountLimit: rules.perAccountLimit,
          stackableWithSales: rules.stackableWithSales,
          createdBy,
          createdAt: now,
          updatedAt: now,
        },
      });
      return toCoupon(row);
    } catch (error) {
      // Code déjà pris (index unique « coupons_code_key »)
      if ((error as { code?: unknown })?.code === "P2002" || postgresCode(error) === "23505")
        return null;
      throw error;
    }
  }

  async setActive(id: string, active: boolean, now: Date): Promise<Coupon | null> {
    const { count } = await this.tx.db.coupon.updateMany({
      where: { id },
      data: { active, updatedAt: now },
    });
    return count ? this.findById(id) : null;
  }

  async list(
    limit: number,
    before?: CouponCursor,
  ): Promise<{ items: Coupon[]; next: CouponCursor | null }> {
    const rows = await this.tx.db.coupon.findMany({
      where: before
        ? {
            OR: [
              { createdAt: { lt: before.createdAt } },
              { createdAt: before.createdAt, id: { lt: before.id } },
            ],
          }
        : {},
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: limit + 1,
    });
    const page = rows.slice(0, limit).map(toCoupon);
    const last = page.at(-1);
    return {
      items: page,
      next: rows.length > limit && last ? { createdAt: last.createdAt, id: last.id } : null,
    };
  }
}
