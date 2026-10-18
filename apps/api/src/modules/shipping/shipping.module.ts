import { Module } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { APP_CONFIG } from "../../config/config.module.js";
import type { AppConfig } from "../../config/env.js";
import { createMailTransport } from "../../mail/mail-transport.factory.js";
import { AuditModule } from "../audit/index.js";
import { IdentityModule } from "../identity/index.js";
import { OrdersModule } from "../orders/index.js";
import {
  CARRIER,
  SHIPMENT_EMAILS,
  SHIPMENT_MAILER,
  SHIPMENT_REPOSITORY,
  SHIPPING_RANDOM,
  SHIPPING_TRANSACTION,
  TARIFF_REPOSITORY,
} from "./application/ports.js";
import { ShipmentNotifier } from "./application/shipment-notifier.service.js";
import { ShipmentService } from "./application/shipment.service.js";
import { TariffService } from "./application/tariff.service.js";
import { ManualCarrier } from "./infrastructure/manual-carrier.js";
import { PrismaShipmentEmailOutbox } from "./infrastructure/prisma-shipment-email.outbox.js";
import { ShipmentEmailScheduler } from "./infrastructure/shipment-emails.js";
import { MailShipmentMailer } from "./infrastructure/shipment-mailer.js";
import { CustomerShipmentController } from "./interface/customer-shipment.controller.js";
import { PrismaShipmentRepository } from "./infrastructure/prisma-shipment.repository.js";
import { PrismaTariffRepository } from "./infrastructure/prisma-tariff.repository.js";
import { ShippingTransactionRunner } from "./infrastructure/shipping-transaction.js";
import { ShipmentController } from "./interface/shipment.controller.js";
import { AdminTariffController, TariffController } from "./interface/tariff.controller.js";

/**
 * Module shipping (ADR-0006, S7-T01, ADR-0040) : barème de livraison réglable (lu par le module orders via
 * `DeliveryTariffs`), expéditions suivies par les administrateurs (via le port `OrderShipping`), part de Kemdia sur les
 * frais de livraison (BR-021). Transporteur « manuel » tant que la question ouverte n° 5 n'est pas tranchée. S7-T02 :
 * livraison vue par le client, e-mails « en route » et « livrée » (ADR-0041).
 */
@Module({
  imports: [IdentityModule, AuditModule, OrdersModule],
  controllers: [
    TariffController,
    AdminTariffController,
    ShipmentController,
    CustomerShipmentController,
  ],
  providers: [
    TariffService,
    ShipmentService,
    { provide: TARIFF_REPOSITORY, useClass: PrismaTariffRepository },
    { provide: SHIPMENT_REPOSITORY, useClass: PrismaShipmentRepository },
    { provide: CARRIER, useClass: ManualCarrier },
    { provide: SHIPPING_TRANSACTION, useClass: ShippingTransactionRunner },
    { provide: SHIPPING_RANDOM, useValue: { uuid: () => randomUUID() } },
    // E-mails au client (S7-T02) : file en base, envoi chaque minute
    ShipmentNotifier,
    ShipmentEmailScheduler,
    { provide: SHIPMENT_EMAILS, useClass: PrismaShipmentEmailOutbox },
    {
      provide: SHIPMENT_MAILER,
      inject: [APP_CONFIG],
      useFactory: (config: AppConfig) => new MailShipmentMailer(createMailTransport(config)),
    },
  ],
})
export class ShippingModule {}
