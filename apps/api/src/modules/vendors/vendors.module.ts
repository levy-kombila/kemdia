import { Module } from "@nestjs/common";
import { randomBytes, randomUUID } from "node:crypto";
import { APP_CONFIG } from "../../config/config.module.js";
import type { AppConfig } from "../../config/env.js";
import { createMailTransport } from "../../mail/mail-transport.factory.js";
import { AuditModule } from "../audit/index.js";
import { CatalogModule, VendorCatalog } from "../catalog/index.js";
import { IdentityModule } from "../identity/index.js";
import { OrdersModule } from "../orders/index.js";
import { Logger } from "@nestjs/common";
import { KycService } from "./application/kyc.service.js";
import { AesKycBox } from "./infrastructure/kyc-box.js";
import { SharpKycImageProcessor } from "./infrastructure/kyc-image-processor.js";
import { KycPurgeScheduler } from "./infrastructure/kyc-purge.js";
import { PrismaKycRepository } from "./infrastructure/prisma-kyc.repository.js";
import { AdminKycController, VendorKycController } from "./interface/kyc.controller.js";
import {
  KYC_BOX,
  KYC_IMAGE_PROCESSOR,
  KYC_REPOSITORY,
  SHOP_LISTING,
  SHOP_REPOSITORY,
  VENDOR_ORDER_MAILER,
  VENDORS_RANDOM,
  VENDORS_TRANSACTION,
} from "./application/ports.js";
import { VendorOrderNotifier } from "./application/vendor-order-notifier.service.js";
import { VendorOrderService } from "./application/vendor-order.service.js";
import { VendorOrderEmailScheduler } from "./infrastructure/vendor-order-emails.js";
import { MailVendorOrderMailer } from "./infrastructure/vendor-order-mailer.js";
import { VendorOrderController } from "./interface/vendor-order.controller.js";
import { ProductModerationService } from "./application/product-moderation.service.js";
import { VendorProductService } from "./application/vendor-product.service.js";
import { ShopService } from "./application/shop.service.js";
import { PrismaShopRepository } from "./infrastructure/prisma-shop.repository.js";
import { VendorsTransactionRunner } from "./infrastructure/vendors-transaction.js";
import { AdminShopController } from "./interface/admin-shop.controller.js";
import { ModerationController } from "./interface/moderation.controller.js";
import { ModerationImageController } from "./interface/moderation-image.controller.js";
import { VendorProductImageController } from "./interface/vendor-product-image.controller.js";
import { VendorProductController } from "./interface/vendor-product.controller.js";
import { ShopController } from "./interface/shop.controller.js";

const SLUG_ALPHABET = "abcdefghijklmnopqrstuvwxyz0123456789";

/**
 * Module vendors (ADR-0006) : boutiques des vendeurs (S6-T01, ADR-0032) — demande d'ouverture, examen par
 * l'administration, rôle vendeur accordé ou retiré par le module identity (`RoleService`) dans la même transaction ;
 * produits des vendeurs et modération (S6-T02, ADR-0033) par le port public `VendorCatalog` du module catalog ;
 * commandes des vendeurs (S6-T07, ADR-0038) par le port public `VendorOrders` du module orders ; vérification des
 * vendeurs, KYC (S6-T08, ADR-0039), chiffrée par la clé KYC_ENCRYPTION_KEY.
 */
@Module({
  imports: [IdentityModule, AuditModule, CatalogModule, OrdersModule],
  controllers: [
    ShopController,
    AdminShopController,
    VendorProductController,
    ModerationController,
    VendorProductImageController,
    ModerationImageController,
    VendorOrderController,
    VendorKycController,
    AdminKycController,
  ],
  providers: [
    ShopService,
    VendorProductService,
    ProductModerationService,
    // Commandes des vendeurs (S6-T07) : décisions, e-mail « nouvelle commande »
    VendorOrderService,
    VendorOrderNotifier,
    VendorOrderEmailScheduler,
    KycService,
    KycPurgeScheduler,
    { provide: KYC_REPOSITORY, useClass: PrismaKycRepository },
    { provide: KYC_IMAGE_PROCESSOR, useClass: SharpKycImageProcessor },
    {
      provide: KYC_BOX,
      inject: [APP_CONFIG],
      useFactory: (c: AppConfig) => {
        const box = new AesKycBox(c);
        const logger = new Logger("Vérification des vendeurs");
        if (box.usesDevelopmentKey && c.NODE_ENV !== "test") {
          logger.warn(
            "clé de développement (publique) : KYC_ENCRYPTION_KEY absente — poste local seulement",
          );
        } else if (!box.available) {
          logger.warn("KYC_ENCRYPTION_KEY absente : vérification des vendeurs indisponible");
        }
        return box;
      },
    },
    {
      provide: VENDOR_ORDER_MAILER,
      inject: [APP_CONFIG],
      useFactory: (config: AppConfig) => new MailVendorOrderMailer(createMailTransport(config)),
    },
    // Suspension d'une boutique : ses produits sont cachés dans le catalogue (S6-T02)
    { provide: SHOP_LISTING, useExisting: VendorCatalog },
    { provide: SHOP_REPOSITORY, useClass: PrismaShopRepository },
    { provide: VENDORS_TRANSACTION, useClass: VendorsTransactionRunner },
    {
      provide: VENDORS_RANDOM,
      useValue: {
        uuid: () => randomUUID(),
        slugSuffix: () =>
          Array.from(randomBytes(4), (byte) => SLUG_ALPHABET[byte % SLUG_ALPHABET.length]).join(""),
      },
    },
  ],
  exports: [ShopService],
})
export class VendorsModule {}
