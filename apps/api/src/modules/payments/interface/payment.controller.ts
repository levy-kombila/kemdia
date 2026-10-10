import {
  Body,
  Controller,
  Get,
  Header,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  UseGuards,
} from "@nestjs/common";
import {
  OrderReferenceParamsSchema,
  StartPaymentRequestSchema,
  type Payment,
  type StartPaymentRequest,
} from "@kemdia/contracts";
import {
  AccountRateLimit,
  CurrentSession,
  SessionGuard,
  type AuthenticatedSession,
} from "../../identity/index.js";
import { PaymentService } from "../application/payment.service.js";
import { presentPaymentView } from "./payment.presenter.js";
import { withPaymentsErrors } from "./payments-http-errors.js";

/**
 * Paiement Mobile Money d'une commande du compte connecté (`/api/v1/orders/{reference}/payments`, S5-T04, ADR-0026).
 * Appelé par le SERVEUR du site avec le jeton de session. Jamais mis en cache. Documentation : payments.openapi.ts.
 */
@Controller("orders/:reference/payments")
@UseGuards(SessionGuard)
export class PaymentController {
  constructor(private readonly payments: PaymentService) {}

  /** Demande la validation sur le téléphone (3 essais au plus, même opérateur que la commande). */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  @Header("Cache-Control", "no-store")
  @AccountRateLimit(10)
  async start(
    @CurrentSession() session: AuthenticatedSession,
    @Param({ schema: OrderReferenceParamsSchema }) params: { reference: string },
    @Body({ schema: StartPaymentRequestSchema }) body: StartPaymentRequest,
  ): Promise<Payment> {
    return presentPaymentView(
      await withPaymentsErrors(() =>
        this.payments.start(session.account.id, params.reference, body.phone),
      ),
    );
  }

  /** Dernier essai (le site interroge pendant que le client valide sur son téléphone). */
  @Get()
  @Header("Cache-Control", "no-store")
  async latest(
    @CurrentSession() session: AuthenticatedSession,
    @Param({ schema: OrderReferenceParamsSchema }) params: { reference: string },
  ): Promise<Payment> {
    return presentPaymentView(
      await withPaymentsErrors(() => this.payments.latest(session.account.id, params.reference)),
    );
  }
}
