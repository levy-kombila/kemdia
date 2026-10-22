import { Controller, Get, Header, Param, Query } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import {
  AccountIdParamsSchema,
  OrderListParamsSchema,
  SupportOrderParamsSchema,
  type Order,
  type OrderListParams,
  type OrderPage,
} from "@kemdia/contracts";
import { AccountRateLimit, Authorize } from "../../identity/index.js";
import { OrderService } from "../application/order.service.js";
import { decodeOrderCursor, presentOrder, presentPage } from "./order.presenter.js";
import { withOrdersErrors } from "./orders-http-errors.js";

/**
 * Commandes d'un client vues par le service client (`/api/v1/support/accounts/{id}/orders`, S7.5-T04, ADR-0051) :
 * LECTURE SEULE, rôle « support » (ou administrateur) avec double authentification. Le compte est d'abord retrouvé par
 * `POST /support/accounts/lookup`, consultation inscrite au journal d'audit.
 */
@Controller("support/accounts/:accountId/orders")
@Authorize("support", { secondFactor: true })
@Throttle({ default: { limit: 60, ttl: 60_000 } })
@AccountRateLimit(60)
export class SupportOrderController {
  constructor(private readonly orders: OrderService) {}

  @Get()
  @Header("Cache-Control", "no-store")
  async list(
    @Param({ schema: AccountIdParamsSchema }) params: { accountId: string },
    @Query({ schema: OrderListParamsSchema }) query: OrderListParams,
  ): Promise<OrderPage> {
    const before = query.before ? decodeOrderCursor(query.before) : undefined;
    return presentPage(await this.orders.list(params.accountId, query.limit, before));
  }

  @Get(":reference")
  @Header("Cache-Control", "no-store")
  async get(
    @Param({ schema: SupportOrderParamsSchema }) params: { accountId: string; reference: string },
  ): Promise<Order> {
    return presentOrder(
      await withOrdersErrors(() => this.orders.get(params.accountId, params.reference)),
    );
  }
}
