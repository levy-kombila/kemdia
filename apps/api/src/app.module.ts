import { DynamicModule, Module, StandardSchemaValidationPipe } from "@nestjs/common";
import { APP_GUARD, APP_PIPE } from "@nestjs/core";
import { ThrottlerModule } from "@nestjs/throttler";
import { LoggerModule } from "nestjs-pino";
import { ConfigModule } from "./config/config.module.js";
import type { AppConfig } from "./config/env.js";
import { DatabaseModule } from "./database/database.module.js";
import { DocsModule } from "./docs/docs.module.js";
import { HealthModule } from "./health/health.module.js";
import { loggerParams } from "./http/logging.js";
import { KemdiaThrottlerGuard, throttlerOptions } from "./http/rate-limit.js";
import { CatalogModule } from "./modules/catalog/index.js";
import { IdentityModule } from "./modules/identity/index.js";
import { OrdersModule } from "./modules/orders/index.js";
import { PaymentsModule } from "./modules/payments/index.js";
import { PrivacyModule } from "./modules/privacy/index.js";
import { ReviewsModule } from "./modules/reviews/index.js";
import { ShippingModule } from "./modules/shipping/index.js";
import { VendorsModule } from "./modules/vendors/index.js";

/**
 * Module racine : il assemble les briques techniques et, à partir du S3-T03, les modules métier
 * (`src/modules/<module>`, voir ADR-0006 et src/modules/README.md).
 */
@Module({})
export class AppModule {
  static register(config: AppConfig): DynamicModule {
    return {
      module: AppModule,
      imports: [
        ConfigModule.forRoot(config),
        LoggerModule.forRoot(loggerParams(config)),
        ThrottlerModule.forRoot(throttlerOptions(config)),
        DatabaseModule,
        HealthModule,
        CatalogModule,
        IdentityModule,
        OrdersModule,
        PaymentsModule,
        VendorsModule,
        ShippingModule,
        ReviewsModule,
        // Données personnelles (S7-T08) : après les modules qu'il assemble
        PrivacyModule,
        // Documentation (/api/docs, /api/v1/openapi.json) : désactivée par défaut en production
        ...(config.API_DOCS ? [DocsModule] : []),
      ],
      providers: [
        // Limitation de débit sur toutes les routes (sauf @SkipThrottle)
        { provide: APP_GUARD, useClass: KemdiaThrottlerGuard },
        // Validation des paramètres qui déclarent un schéma : @Body({ schema })
        { provide: APP_PIPE, useValue: new StandardSchemaValidationPipe() },
      ],
    };
  }
}
