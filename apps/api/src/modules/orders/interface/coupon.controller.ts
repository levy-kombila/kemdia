import {
  Body,
  Controller,
  Get,
  Header,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UnprocessableEntityException,
} from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import type { Request } from "express";
import {
  CouponCreateRequestSchema,
  CouponIdParamsSchema,
  CouponListParamsSchema,
  CouponUpdateRequestSchema,
  type Coupon as CouponView,
  type CouponCreateRequest,
  type CouponListParams,
  type CouponPage,
  type CouponUpdateRequest,
} from "@kemdia/contracts";
import { auditContextOf } from "../../audit/index.js";
import {
  AccountRateLimit,
  Authorize,
  CurrentSession,
  type AuthenticatedSession,
} from "../../identity/index.js";
import { CouponRulesError, CouponService } from "../application/coupon.service.js";
import type { Coupon } from "../domain/coupon.js";
import { decodeOrderCursor, encodeOrderCursor } from "./order.presenter.js";
import { withOrdersErrors } from "./orders-http-errors.js";

function present(coupon: Coupon): CouponView {
  return {
    id: coupon.id,
    code: coupon.code,
    kind: coupon.kind,
    value: coupon.value,
    maxDiscount: coupon.maxDiscount,
    minSubtotal: coupon.minSubtotal,
    startsAt: coupon.startsAt.toISOString(),
    endsAt: coupon.endsAt?.toISOString() ?? null,
    usageLimit: coupon.usageLimit,
    usedCount: coupon.usedCount,
    perAccountLimit: coupon.perAccountLimit,
    stackableWithSales: coupon.stackableWithSales,
    active: coupon.active,
    createdAt: coupon.createdAt.toISOString(),
  };
}

/**
 * Administration des coupons (`/api/v1/admin/coupons`, S5-T03, ADR-0025). Mêmes protections que les autres routes
 * d'administration (ADR-0020) : administrateur, double authentification confirmée depuis moins de 15 minutes (S6-T03), 30 requêtes par minute par adresse
 * et par compte, jamais mis en cache, chaque changement au journal d'audit. Écrans au S6.
 */
@Controller("admin/coupons")
@Authorize("admin", { secondFactor: true })
@Throttle({ default: { limit: 30, ttl: 60_000 } })
@AccountRateLimit(30)
export class CouponController {
  constructor(private readonly coupons: CouponService) {}

  @Post()
  @Header("Cache-Control", "no-store")
  async create(
    @CurrentSession() session: AuthenticatedSession,
    @Body({ schema: CouponCreateRequestSchema }) body: CouponCreateRequest,
    @Req() req: Request,
  ): Promise<CouponView> {
    try {
      return present(
        await withOrdersErrors(() =>
          this.coupons.create(session.account.id, body, auditContextOf(req)),
        ),
      );
    } catch (error) {
      if (error instanceof CouponRulesError) {
        throw new UnprocessableEntityException(
          error.message.charAt(0).toUpperCase() + error.message.slice(1),
        );
      }
      throw error;
    }
  }

  @Get()
  @Header("Cache-Control", "no-store")
  async list(
    @Query({ schema: CouponListParamsSchema }) query: CouponListParams,
  ): Promise<CouponPage> {
    const before = query.before ? decodeOrderCursor(query.before) : undefined;
    const page = await this.coupons.list(query.limit, before);
    return {
      items: page.items.map(present),
      nextCursor: page.next ? encodeOrderCursor(page.next) : null,
    };
  }

  /** Activer ou désactiver (les règles d'un coupon ne changent pas une fois créé). */
  @Patch(":couponId")
  @Header("Cache-Control", "no-store")
  async update(
    @CurrentSession() session: AuthenticatedSession,
    @Param({ schema: CouponIdParamsSchema }) params: { couponId: string },
    @Body({ schema: CouponUpdateRequestSchema }) body: CouponUpdateRequest,
    @Req() req: Request,
  ): Promise<CouponView> {
    return present(
      await withOrdersErrors(() =>
        this.coupons.setActive(
          session.account.id,
          params.couponId,
          body.active,
          auditContextOf(req),
        ),
      ),
    );
  }
}
