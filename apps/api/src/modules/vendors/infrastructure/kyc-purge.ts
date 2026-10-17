import {
  Inject,
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnModuleDestroy,
} from "@nestjs/common";
import { APP_CONFIG } from "../../../config/config.module.js";
import type { AppConfig } from "../../../config/env.js";
import { KycService } from "../application/kyc.service.js";

/** Toutes les heures : photos des dossiers décidés depuis 30 jours effacées (S6-T08, ADR-0039). */
const EVERY_MS = 3_600_000;

@Injectable()
export class KycPurgeScheduler implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger("Vérification des vendeurs");
  private timer: NodeJS.Timeout | undefined;

  constructor(
    private readonly kyc: KycService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  onApplicationBootstrap(): void {
    if (this.config.NODE_ENV === "test") return;
    this.timer = setInterval(() => void this.run(), EVERY_MS);
    this.timer.unref();
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  async run(): Promise<void> {
    try {
      const count = await this.kyc.purge();
      if (count > 0) this.logger.log(`photos de pièces effacées : ${count}`);
    } catch (error) {
      this.logger.warn(
        `effacement impossible : ${error instanceof Error ? error.name : "erreur inconnue"}`,
      );
    }
  }
}
