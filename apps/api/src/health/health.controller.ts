import { Controller, Get, Header, Inject, VERSION_NEUTRAL } from "@nestjs/common";
import { APP_CONFIG } from "../config/config.module.js";
import type { AppConfig } from "../config/env.js";

export interface HealthStatus {
  status: "ok";
  version: string;
  environment: AppConfig["APP_ENV"];
}

/**
 * Contrôle de santé (`GET /api/health`), comme celui du site :
 * healthcheck Docker et test de fumée du pipeline. Aucune information sensible.
 * La vérification de la base de données s'ajoutera au S3-T02.
 */
@Controller({ path: "health", version: VERSION_NEUTRAL })
export class HealthController {
  constructor(@Inject(APP_CONFIG) private readonly config: AppConfig) {}

  @Get()
  @Header("Cache-Control", "no-store")
  check(): HealthStatus {
    return { status: "ok", version: this.config.APP_VERSION, environment: this.config.APP_ENV };
  }
}
