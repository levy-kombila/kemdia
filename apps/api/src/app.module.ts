import { DynamicModule, Module } from "@nestjs/common";
import { LoggerModule } from "nestjs-pino";
import { ConfigModule } from "./config/config.module.js";
import type { AppConfig } from "./config/env.js";
import { DatabaseModule } from "./database/database.module.js";
import { HealthModule } from "./health/health.module.js";
import { loggerParams } from "./http/logging.js";
import { CatalogModule } from "./modules/catalog/index.js";

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
        DatabaseModule,
        HealthModule,
        CatalogModule,
      ],
    };
  }
}
