import { Module } from "@nestjs/common";
import { randomBytes, randomUUID } from "node:crypto";
import { AuditModule } from "../audit/index.js";
import { CatalogModule, VendorCatalog } from "../catalog/index.js";
import { IdentityModule } from "../identity/index.js";
import {
  SHOP_LISTING,
  SHOP_REPOSITORY,
  VENDORS_RANDOM,
  VENDORS_TRANSACTION,
} from "./application/ports.js";
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
 * produits des vendeurs et modération (S6-T02, ADR-0033) par le port public `VendorCatalog` du module catalog.
 */
@Module({
  imports: [IdentityModule, AuditModule, CatalogModule],
  controllers: [
    ShopController,
    AdminShopController,
    VendorProductController,
    ModerationController,
    VendorProductImageController,
    ModerationImageController,
  ],
  providers: [
    ShopService,
    VendorProductService,
    ProductModerationService,
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
