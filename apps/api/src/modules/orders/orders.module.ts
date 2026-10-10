import { Module } from "@nestjs/common";
import { randomBytes } from "node:crypto";
import { CatalogModule, CatalogService, StockService } from "../catalog/index.js";
import { IdentityModule } from "../identity/index.js";
import { CartService } from "./application/cart.service.js";
import { OrderService } from "./application/order.service.js";
import {
  CART_CATALOG,
  CART_REPOSITORY,
  ORDER_RANDOM,
  ORDER_REPOSITORY,
  ORDER_STOCK,
  ORDERS_TRANSACTION,
} from "./application/ports.js";
import { OrdersTransactionRunner } from "./infrastructure/orders-transaction.js";
import { OverdueOrdersScheduler } from "./infrastructure/overdue-orders.js";
import { PrismaOrderRepository } from "./infrastructure/prisma-order.repository.js";
import { OrderController } from "./interface/order.controller.js";
import { CartCleanupScheduler } from "./infrastructure/cart-cleanup.js";
import { PrismaCartRepository } from "./infrastructure/prisma-cart.repository.js";
import { CartController } from "./interface/cart.controller.js";

/**
 * Module orders (ADR-0006) : panier serveur (S5-T01, ADR-0023) ; commandes et réservation du stock (S5-T02, ADR-0024).
 * Lit le catalogue par son port public (`CatalogService`), protège ses routes avec `SessionGuard` (module identity).
 */
@Module({
  imports: [CatalogModule, IdentityModule],
  controllers: [CartController, OrderController],
  providers: [
    CartService,
    CartCleanupScheduler,
    { provide: CART_REPOSITORY, useClass: PrismaCartRepository },
    { provide: CART_CATALOG, useExisting: CatalogService },
    OrderService,
    OverdueOrdersScheduler,
    { provide: ORDER_REPOSITORY, useClass: PrismaOrderRepository },
    { provide: ORDERS_TRANSACTION, useClass: OrdersTransactionRunner },
    { provide: ORDER_STOCK, useExisting: StockService },
    { provide: ORDER_RANDOM, useValue: (size: number) => new Uint8Array(randomBytes(size)) },
  ],
  exports: [CartService, OrderService],
})
export class OrdersModule {}
