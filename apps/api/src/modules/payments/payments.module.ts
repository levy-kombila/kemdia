import { Module } from "@nestjs/common";
import { APP_CONFIG } from "../../config/config.module.js";
import type { AppConfig } from "../../config/env.js";
import { AuditModule } from "../audit/index.js";
import { IdentityModule } from "../identity/index.js";
import { OrdersModule } from "../orders/index.js";
import { PaymentAdminService } from "./application/payment-admin.service.js";
import { PaymentService } from "./application/payment.service.js";
import { PAYMENT_PROVIDER, PAYMENT_REPOSITORY, REFUND_REPOSITORY } from "./application/ports.js";
import { choosePaymentProvider } from "./infrastructure/payment-providers.js";
import {
  PrismaPaymentRepository,
  PrismaRefundRepository,
} from "./infrastructure/prisma-payment.repository.js";
import { StalePaymentsScheduler } from "./infrastructure/stale-payments.js";
import { PaymentAdminController } from "./interface/payment-admin.controller.js";
import { PaymentController } from "./interface/payment.controller.js";

/**
 * Module payments (ADR-0006, S5-T04, ADR-0026) : essais de paiement Mobile Money, encaissement à la livraison,
 * remboursements. Change le statut des commandes par le port public du module orders (`OrderPayments`).
 * Fournisseur : simulé sur le poste de développement et la démo, aucun ailleurs (question ouverte n° 7).
 */
@Module({
  imports: [OrdersModule, IdentityModule, AuditModule],
  controllers: [PaymentController, PaymentAdminController],
  providers: [
    PaymentService,
    PaymentAdminService,
    StalePaymentsScheduler,
    { provide: PAYMENT_REPOSITORY, useClass: PrismaPaymentRepository },
    { provide: REFUND_REPOSITORY, useClass: PrismaRefundRepository },
    {
      provide: PAYMENT_PROVIDER,
      inject: [APP_CONFIG],
      useFactory: (config: AppConfig) => choosePaymentProvider(config),
    },
  ],
  exports: [PaymentService],
})
export class PaymentsModule {}
