import { randomBytes } from "node:crypto";
import { Module } from "@nestjs/common";
import { APP_CONFIG } from "../../config/config.module.js";
import type { AppConfig } from "../../config/env.js";
import { AuditModule } from "../audit/index.js";
import { IdentityModule } from "../identity/index.js";
import { OrdersModule } from "../orders/index.js";
import { PaymentAdminService } from "./application/payment-admin.service.js";
import { NotificationService } from "./application/notification.service.js";
import { PaymentService } from "./application/payment.service.js";
import {
  PAYMENT_PROVIDER,
  PAYMENT_REPOSITORY,
  PROVIDER_EVENT_REPOSITORY,
  REFUND_REPOSITORY,
  WEBHOOK_KEY,
  type WebhookKey,
} from "./application/ports.js";
import { sandboxEnabled, UnavailablePaymentProvider } from "./infrastructure/payment-providers.js";
import {
  PrismaPaymentRepository,
  PrismaProviderEventRepository,
  PrismaRefundRepository,
} from "./infrastructure/prisma-payment.repository.js";
import { SANDBOX_OPERATOR, SandboxOperator } from "./infrastructure/sandbox-operator.js";
import { SandboxController } from "./interface/sandbox.controller.js";
import { WebhookController } from "./interface/webhook.controller.js";
import { StalePaymentsScheduler } from "./infrastructure/stale-payments.js";
import { PaymentAdminController } from "./interface/payment-admin.controller.js";
import { PaymentController } from "./interface/payment.controller.js";

/**
 * Module payments (ADR-0006, S5-T04, ADR-0026) : essais de paiement Mobile Money, encaissement à la livraison,
 * remboursements. Change le statut des commandes par le port public du module orders (`OrderPayments`).
 * Fournisseur : opérateur simulé (téléphone simulé, notifications signées — S5-T05) sur le poste de développement et
 * la démo, aucun ailleurs (question ouverte n° 7).
 */
@Module({
  imports: [OrdersModule, IdentityModule, AuditModule],
  controllers: [PaymentController, PaymentAdminController, WebhookController, SandboxController],
  providers: [
    PaymentService,
    PaymentAdminService,
    StalePaymentsScheduler,
    { provide: PAYMENT_REPOSITORY, useClass: PrismaPaymentRepository },
    { provide: REFUND_REPOSITORY, useClass: PrismaRefundRepository },
    NotificationService,
    { provide: PROVIDER_EVENT_REPOSITORY, useClass: PrismaProviderEventRepository },
    // Clé des notifications : tirée au démarrage pour l'opérateur simulé (choix du 2026-10-11) ; aucune ailleurs
    {
      provide: WEBHOOK_KEY,
      inject: [APP_CONFIG],
      useFactory: (config: AppConfig): WebhookKey => ({
        secret: sandboxEnabled(config) ? new Uint8Array(randomBytes(32)) : null,
      }),
    },
    {
      provide: SANDBOX_OPERATOR,
      inject: [APP_CONFIG, WEBHOOK_KEY],
      useFactory: (config: AppConfig, key: WebhookKey) =>
        sandboxEnabled(config) ? new SandboxOperator(key, config.PORT) : null,
    },
    {
      provide: PAYMENT_PROVIDER,
      inject: [SANDBOX_OPERATOR],
      useFactory: (sandbox: SandboxOperator | null) => sandbox ?? new UnavailablePaymentProvider(),
    },
  ],
  exports: [PaymentService],
})
export class PaymentsModule {}
