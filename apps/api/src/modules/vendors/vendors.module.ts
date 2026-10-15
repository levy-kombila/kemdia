import { Module } from "@nestjs/common";
import { randomBytes, randomUUID } from "node:crypto";
import { AuditModule } from "../audit/index.js";
import { IdentityModule } from "../identity/index.js";
import { SHOP_REPOSITORY, VENDORS_RANDOM, VENDORS_TRANSACTION } from "./application/ports.js";
import { ShopService } from "./application/shop.service.js";
import { PrismaShopRepository } from "./infrastructure/prisma-shop.repository.js";
import { VendorsTransactionRunner } from "./infrastructure/vendors-transaction.js";
import { AdminShopController } from "./interface/admin-shop.controller.js";
import { ShopController } from "./interface/shop.controller.js";

const SLUG_ALPHABET = "abcdefghijklmnopqrstuvwxyz0123456789";

/**
 * Module vendors (ADR-0006) : boutiques des vendeurs (S6-T01, ADR-0032) — demande d'ouverture, examen par
 * l'administration, rôle vendeur accordé ou retiré par le module identity (`RoleService`) dans la même transaction.
 */
@Module({
  imports: [IdentityModule, AuditModule],
  controllers: [ShopController, AdminShopController],
  providers: [
    ShopService,
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
