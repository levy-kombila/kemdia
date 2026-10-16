import {
  Body,
  Controller,
  Get,
  Header,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  Req,
  Res,
} from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import type { Request, Response } from "express";
import {
  AdminCancelOrderRequestSchema,
  CodCollectedRequestSchema,
  OrderReferenceParamsSchema,
  RefundDoneRequestSchema,
  RefundIdParamsSchema,
  RefundListParamsSchema,
  type AdminCancelOrderRequest,
  type CodCollectedRequest,
  type Order,
  type Payment,
  type Refund,
  type RefundDoneRequest,
  type RefundPage,
} from "@kemdia/contracts";
import { auditContextOf } from "../../audit/index.js";
import {
  AccountRateLimit,
  Authorize,
  CurrentSession,
  type AuthenticatedSession,
} from "../../identity/index.js";
import { presentOrder } from "../../orders/index.js";
import { PaymentAdminService } from "../application/payment-admin.service.js";
import { presentPayment, presentRefund } from "./payment.presenter.js";
import { withPaymentsErrors } from "./payments-http-errors.js";

/**
 * Service client (`/api/v1/admin/orders/…`, `/api/v1/admin/refunds/…`, S5-T04, ADR-0026) : annuler une commande,
 * suivre les remboursements, noter un encaissement à la livraison. Mêmes protections que les autres routes
 * d'administration (ADR-0020) ; chaque action au journal d'audit. Écrans au S6.
 */
@Controller("admin")
@Authorize("admin", { secondFactor: true })
@Throttle({ default: { limit: 30, ttl: 60_000 } })
@AccountRateLimit(30)
export class PaymentAdminController {
  constructor(private readonly admin: PaymentAdminService) {}

  @Post("orders/:reference/cancel")
  @HttpCode(HttpStatus.OK)
  @Header("Cache-Control", "no-store")
  async cancel(
    @CurrentSession() session: AuthenticatedSession,
    @Param({ schema: OrderReferenceParamsSchema }) params: { reference: string },
    @Body({ schema: AdminCancelOrderRequestSchema }) body: AdminCancelOrderRequest,
    @Req() req: Request,
  ): Promise<Order> {
    const { order } = await withPaymentsErrors(() =>
      this.admin.cancelOrder(session.account.id, params.reference, body.note, auditContextOf(req)),
    );
    return presentOrder(order);
  }

  /** Encaissement noté (201) ; déjà noté : l'encaissement existant (200). */
  @Post("orders/:reference/cod-collected")
  @Header("Cache-Control", "no-store")
  async codCollected(
    @CurrentSession() session: AuthenticatedSession,
    @Param({ schema: OrderReferenceParamsSchema }) params: { reference: string },
    @Body({ schema: CodCollectedRequestSchema }) body: CodCollectedRequest,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<Payment> {
    const { payment, order, created } = await withPaymentsErrors(() =>
      this.admin.codCollected(
        session.account.id,
        params.reference,
        body.amount,
        auditContextOf(req),
      ),
    );
    res.status(created ? HttpStatus.CREATED : HttpStatus.OK);
    return presentPayment(payment, order.reference, 0);
  }

  @Get("refunds")
  @Header("Cache-Control", "no-store")
  async refunds(
    @Query({ schema: RefundListParamsSchema }) query: { status: "to_do" | "done" },
  ): Promise<RefundPage> {
    return { items: (await this.admin.listRefunds(query.status)).map(presentRefund) };
  }

  @Post("refunds/:refundId/done")
  @HttpCode(HttpStatus.OK)
  @Header("Cache-Control", "no-store")
  async refundDone(
    @CurrentSession() session: AuthenticatedSession,
    @Param({ schema: RefundIdParamsSchema }) params: { refundId: string },
    @Body({ schema: RefundDoneRequestSchema }) body: RefundDoneRequest,
    @Req() req: Request,
  ): Promise<Refund> {
    return presentRefund(
      await withPaymentsErrors(() =>
        this.admin.markRefundDone(
          session.account.id,
          params.refundId,
          body.externalReference,
          auditContextOf(req),
        ),
      ),
    );
  }
}
