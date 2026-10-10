import { Module } from "@nestjs/common";
import { CatalogModule, CatalogService } from "../catalog/index.js";
import { IdentityModule } from "../identity/index.js";
import { CartService } from "./application/cart.service.js";
import { CART_CATALOG, CART_REPOSITORY } from "./application/ports.js";
import { CartCleanupScheduler } from "./infrastructure/cart-cleanup.js";
import { PrismaCartRepository } from "./infrastructure/prisma-cart.repository.js";
import { CartController } from "./interface/cart.controller.js";

/**
 * Module orders (ADR-0006) : panier serveur (S5-T01, ADR-0023) ; commandes et réservation du stock au S5-T02.
 * Lit le catalogue par son port public (`CatalogService`), protège ses routes avec `SessionGuard` (module identity).
 */
@Module({
  imports: [CatalogModule, IdentityModule],
  controllers: [CartController],
  providers: [
    CartService,
    CartCleanupScheduler,
    { provide: CART_REPOSITORY, useClass: PrismaCartRepository },
    { provide: CART_CATALOG, useExisting: CatalogService },
  ],
  exports: [CartService],
})
export class OrdersModule {}
