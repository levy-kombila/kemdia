import { Module } from "@nestjs/common";
import { AuditModule } from "../audit/index.js";
import { IdentityModule } from "../identity/index.js";
import { OrdersModule } from "../orders/index.js";
import { PaymentsModule } from "../payments/index.js";
import { ShippingModule } from "../shipping/index.js";
import { VendorsModule } from "../vendors/index.js";
import { PERSONAL_DATA_STORE, PRIVACY_CLOCK, PRIVACY_TRANSACTION } from "./application/ports.js";
import { PrivacyService } from "./application/privacy.service.js";
import { InactivityScheduler } from "./infrastructure/inactivity-scheduler.js";
import { ModulesPersonalData } from "./infrastructure/modules-personal-data.js";
import { PrismaPrivacyTransaction } from "./infrastructure/privacy-transaction.js";
import { PrivacyController } from "./interface/privacy.controller.js";

/**
 * Module privacy (S7-T08, ADR-0047) : droits sur les données personnelles (loi gabonaise n°001/2011 modifiée par la
 * loi n°025/2023, autorité APDPVP) — copie, suppression du compte, effacement des comptes inactifs. Il assemble les
 * `XxxPersonalData` des autres modules ; aucun module ne l'importe.
 */
@Module({
  imports: [
    IdentityModule,
    AuditModule,
    OrdersModule,
    PaymentsModule,
    ShippingModule,
    VendorsModule,
  ],
  controllers: [PrivacyController],
  providers: [
    PrivacyService,
    InactivityScheduler,
    { provide: PERSONAL_DATA_STORE, useClass: ModulesPersonalData },
    { provide: PRIVACY_TRANSACTION, useClass: PrismaPrivacyTransaction },
    { provide: PRIVACY_CLOCK, useValue: { now: () => new Date() } },
  ],
})
export class PrivacyModule {}
