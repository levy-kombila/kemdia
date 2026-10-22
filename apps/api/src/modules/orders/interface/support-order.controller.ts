import { Controller, Get, Header, Param, Query, Req } from "@nestjs/common";
import type { Request } from "express";
import { Throttle } from "@nestjs/throttler";
import {
  AccountIdParamsSchema,
  OrderListParamsSchema,
  SupportOrderParamsSchema,
  type Order,
  type OrderListParams,
  type OrderPage,
} from "@kemdia/contracts";
import { auditContextOf } from "../../audit/index.js";
import {
  AccountRateLimit,
  Authorize,
  CurrentSession,
  SupportService,
  withIdentityErrors,
  type AuthenticatedSession,
} from "../../identity/index.js";
import { OrderService } from "../application/order.service.js";
import { decodeOrderCursor, presentOrder, presentPage } from "./order.presenter.js";
import { withOrdersErrors } from "./orders-http-errors.js";

/**
 * Commandes d'un client vues par le service client (`/api/v1/support/accounts/{id}/orders`, S7.5-T04, ADR-0051) :
 * LECTURE SEULE, rôle « support » (ou administrateur) avec double authentification. Le compte est d'abord retrouvé par
 * `POST /support/accounts/lookup`. Chaque lecture est inscrite au journal (`support.orders_viewed`) ; un compte inconnu
 * répond `COMPTE_INTROUVABLE` (relecture de sécurité).
 */
@Controller("support/accounts/:accountId/orders")
@Authorize("support", { secondFactor: true })
@Throttle({ default: { limit: 60, ttl: 60_000 } })
@AccountRateLimit(60)
export class SupportOrderController {
  constructor(
    private readonly orders: OrderService,
    private readonly support: SupportService,
  ) {}

  private trace(
    session: AuthenticatedSession,
    accountId: string,
    reference: string | null,
    req: Request,
  ) {
    return withIdentityErrors(() =>
      this.support.recordOrdersView(
        { accountId: session.account.id, roles: session.account.roles },
        accountId,
        reference,
        auditContextOf(req),
      ),
    );
  }

  @Get()
  @Header("Cache-Control", "no-store")
  async list(
    @Param({ schema: AccountIdParamsSchema }) params: { accountId: string },
    @Query({ schema: OrderListParamsSchema }) query: OrderListParams,
    @CurrentSession() session: AuthenticatedSession,
    @Req() req: Request,
  ): Promise<OrderPage> {
    await this.trace(session, params.accountId, null, req);
    const before = query.before ? decodeOrderCursor(query.before) : undefined;
    return presentPage(await this.orders.list(params.accountId, query.limit, before));
  }

  @Get(":reference")
  @Header("Cache-Control", "no-store")
  async get(
    @Param({ schema: SupportOrderParamsSchema }) params: { accountId: string; reference: string },
    @CurrentSession() session: AuthenticatedSession,
    @Req() req: Request,
  ): Promise<Order> {
    await this.trace(session, params.accountId, params.reference, req);
    return presentOrder(
      await withOrdersErrors(() => this.orders.get(params.accountId, params.reference)),
    );
  }
}
