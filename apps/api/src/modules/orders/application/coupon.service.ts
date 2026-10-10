import { Inject, Injectable } from "@nestjs/common";
import { AuditLog, type AuditContext } from "../../audit/index.js";
import { validateCouponRules, type Coupon, type CouponKind } from "../domain/coupon.js";
import { OrdersError } from "../domain/orders-error.js";
import {
  COUPON_REPOSITORY,
  ORDERS_TRANSACTION,
  type CouponCursor,
  type CouponRepository,
  type OrdersTransaction,
} from "./ports.js";

export interface CreateCouponInput {
  code: string;
  kind: CouponKind;
  value: number;
  maxDiscount?: number | null | undefined;
  minSubtotal?: number | null | undefined;
  startsAt?: string | null | undefined;
  endsAt?: string | null | undefined;
  usageLimit?: number | null | undefined;
  perAccountLimit?: number | null | undefined;
  stackableWithSales?: boolean | undefined;
}

/**
 * Administration des coupons (S5-T03, ADR-0025) : créer, lister, activer / désactiver. Réservé aux administrateurs
 * (route protégée par `@Authorize`). Chaque création ou changement est inscrit au journal d'audit dans la même
 * transaction. Les règles d'un coupon ne changent plus une fois créé (la base le refuse) : pour une autre promotion,
 * on crée un autre coupon.
 */
@Injectable()
export class CouponService {
  /** Horloge (remplaçable dans les tests). */
  clock: () => Date = () => new Date();

  constructor(
    @Inject(COUPON_REPOSITORY) private readonly coupons: CouponRepository,
    @Inject(ORDERS_TRANSACTION) private readonly tx: OrdersTransaction,
    @Inject(AuditLog) private readonly audit: Pick<AuditLog, "record">,
  ) {}

  async create(adminId: string, input: CreateCouponInput, context: AuditContext): Promise<Coupon> {
    const now = this.clock();
    let rules;
    try {
      rules = validateCouponRules({
        code: input.code,
        kind: input.kind,
        value: input.value,
        maxDiscount: input.maxDiscount ?? null,
        minSubtotal: input.minSubtotal ?? null,
        startsAt: input.startsAt ? new Date(input.startsAt) : now,
        endsAt: input.endsAt ? new Date(input.endsAt) : null,
        usageLimit: input.usageLimit ?? null,
        // Une fois par compte par défaut ; null explicite : sans limite
        perAccountLimit: input.perAccountLimit === undefined ? 1 : input.perAccountLimit,
        stackableWithSales: input.stackableWithSales ?? false,
      });
    } catch (error) {
      if (error instanceof RangeError) throw new CouponRulesError(error.message);
      throw error;
    }
    return this.tx.run(async () => {
      if (await this.coupons.findByCode(rules.code)) throw exists();
      const coupon = await this.coupons.create(rules, adminId, now);
      if (!coupon) throw exists();
      await this.audit.record({
        action: "coupon.created",
        actor: { type: "account", id: adminId },
        target: { type: "coupon", id: coupon.id },
        details: { code: coupon.code, kind: coupon.kind, value: coupon.value },
        context,
      });
      return coupon;
    });
  }

  async setActive(
    adminId: string,
    couponId: string,
    active: boolean,
    context: AuditContext,
  ): Promise<Coupon> {
    return this.tx.run(async () => {
      const before = await this.coupons.findById(couponId);
      if (!before) throw new OrdersError("COUPON_INTROUVABLE", "coupon introuvable");
      if (before.active === active) return before;
      const coupon = (await this.coupons.setActive(couponId, active, this.clock()))!;
      await this.audit.record({
        action: "coupon.updated",
        actor: { type: "account", id: adminId },
        target: { type: "coupon", id: coupon.id },
        details: { code: coupon.code, active: active ? "oui" : "non" },
        context,
      });
      return coupon;
    });
  }

  list(
    limit: number,
    before?: CouponCursor,
  ): Promise<{ items: Coupon[]; next: CouponCursor | null }> {
    return this.coupons.list(limit, before);
  }
}

/** Règle d'un nouveau coupon non respectée (champ en cause dans le message) → 422. */
export class CouponRulesError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CouponRulesError";
  }
}

function exists(): OrdersError {
  return new OrdersError("COUPON_EXISTE", "un coupon porte déjà ce code");
}
