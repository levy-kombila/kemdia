import { Controller, Get, Header, Inject, Res, VERSION_NEUTRAL } from "@nestjs/common";
import type { Response } from "express";
import { APP_CONFIG } from "../config/config.module.js";
import type { AppConfig } from "../config/env.js";
import { DatabaseHealth, type DatabaseStatus } from "../database/database-health.js";

export interface HealthStatus {
  status: "ok" | "degrade";
  version: string;
  environment: AppConfig["APP_ENV"];
  checks: { database: DatabaseStatus };
}

/**
 * Contrôle de santé (`GET /api/health`), comme celui du site :
 * healthcheck Docker et test de fumée du pipeline. Aucune information sensible.
 *
 * - 200 : l'API et PostgreSQL répondent ;
 * - 503 : l'API tourne mais la base est indisponible (le conteneur est alors marqué « unhealthy »).
 */
@Controller({ path: "health", version: VERSION_NEUTRAL })
export class HealthController {
  constructor(
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    private readonly database: DatabaseHealth,
  ) {}

  @Get()
  @Header("Cache-Control", "no-store")
  async check(@Res({ passthrough: true }) res: Response): Promise<HealthStatus> {
    const database = await this.database.check();
    const healthy = database === "ok";
    res.status(healthy ? 200 : 503);
    return {
      status: healthy ? "ok" : "degrade",
      version: this.config.APP_VERSION,
      environment: this.config.APP_ENV,
      checks: { database },
    };
  }
}
