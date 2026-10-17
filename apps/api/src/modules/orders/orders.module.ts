import { Module } from "@nestjs/common";
import { randomBytes } from "node:crypto";
import { APP_CONFIG } from "../../config/config.module.js";
import type { AppConfig } from "../../config/env.js";
import { mobileMoneyAvailable } from "../../config/mobile-money.js";
import { CatalogModule, CatalogService, StockService } from "../catalog/index.js";
import { AuditModule } from "../audit/index.js";
import { IdentityModule } from "../identity/index.js";
import { CartService } from "./application/cart.service.js";
import { CodSettingsService } from "./application/cod-settings.service.js";
import { CouponService } from "./application/coupon.service.js";
import { OrderCancelHooks } from "./application/order-cancel-hooks.js";
import { OrderPayments } from "./application/order-payments.service.js";
import { OrderService } from "./application/order.service.js";
import { VendorOrders } from "./application/vendor-orders.service.js";
import {
  CART_CATALOG,
  CART_REPOSITORY,
  COD_SETTINGS_REPOSITORY,
  COUPON_REPOSITORY,
  MOBILE_MONEY,
  ORDER_RANDOM,
  ORDER_REPOSITORY,
  ORDER_STOCK,
  ORDERS_TRANSACTION,
} from "./application/ports.js";
import { OrdersTransactionRunner } from "./infrastructure/orders-transaction.js";
import { OverdueOrdersScheduler } from "./infrastructure/overdue-orders.js";
import { PrismaCodSettingsRepository } from "./infrastructure/prisma-cod-settings.repository.js";
import { PrismaCouponRepository } from "./infrastructure/prisma-coupon.repository.js";
import { CodSettingsController } from "./interface/cod-settings.controller.js";
import { PrismaOrderRepository } from "./infrastructure/prisma-order.repository.js";
import { CouponController } from "./interface/coupon.controller.js";
import { OrderController } from "./interface/order.controller.js";
import { CartCleanupScheduler } from "./infrastructure/cart-cleanup.js";
import { PrismaCartRepository } from "./infrastructure/prisma-cart.repository.js";
import { CartController } from "./interface/cart.controller.js";

/**
 * Module orders (ADR-0006) : panier serveur (S5-T01, ADR-0023) ; commandes et réservation du stock (S5-T02, ADR-0024) ;
 * coupons (S5-T03, ADR-0025) ; réglage du paiement à la livraison et `OrderPayments` pour le module payments (S5-T04) ;
 * parts par boutique et `VendorOrders` pour le module vendors (S6-T07, ADR-0038).
 * Lit le catalogue par son port public (`CatalogService`), protège ses routes avec `SessionGuard` (module identity).
 */
@Module({
  imports: [CatalogModule, IdentityModule, AuditModule],
  controllers: [CartController, OrderController, CouponController, CodSettingsController],
  providers: [
    CartService,
    CartCleanupScheduler,
    { provide: CART_REPOSITORY, useClass: PrismaCartRepository },
    { provide: CART_CATALOG, useExisting: CatalogService },
    OrderService,
    OrderCancelHooks,
    CouponService,
    CodSettingsService,
    OrderPayments,
    VendorOrders,
    { provide: COD_SETTINGS_REPOSITORY, useClass: PrismaCodSettingsRepository },
    { provide: COUPON_REPOSITORY, useClass: PrismaCouponRepository },
    OverdueOrdersScheduler,
    { provide: ORDER_REPOSITORY, useClass: PrismaOrderRepository },
    { provide: ORDERS_TRANSACTION, useClass: OrdersTransactionRunner },
    { provide: ORDER_STOCK, useExisting: StockService },
    { provide: ORDER_RANDOM, useValue: (size: number) => new Uint8Array(randomBytes(size)) },
    // Même règle que le fournisseur du module payments (S5-T07, ADR-0029)
    {
      provide: MOBILE_MONEY,
      inject: [APP_CONFIG],
      useFactory: (config: AppConfig) => ({ available: mobileMoneyAvailable(config) }),
    },
  ],
  exports: [CartService, OrderService, OrderPayments, OrderCancelHooks, VendorOrders],
})
export class OrdersModule {}
