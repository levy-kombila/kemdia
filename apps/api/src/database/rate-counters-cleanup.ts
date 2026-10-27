import {
  Inject,
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnModuleDestroy,
} from "@nestjs/common";
import { APP_CONFIG } from "../config/config.module.js";
import type { AppConfig } from "../config/env.js";
import { RATE_COUNTERS, type RateCounters } from "./rate-counters.js";

const EVERY_MS = 10 * 60_000;

/**
 * Efface toutes les 10 minutes les compteurs terminés (S8-T07) : la table ne garde que les fenêtres et blocages en
 * cours. Sans risque si plusieurs instances le font en même temps (simple `DELETE`). Désactivé pendant les tests.
 */
@Injectable()
export class RateCountersCleanup implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger("Ménage compteurs");
  private timer: NodeJS.Timeout | undefined;

  constructor(
    @Inject(RATE_COUNTERS) private readonly counters: RateCounters,
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

  async run(now = new Date()): Promise<number> {
    try {
      return await this.counters.purge(now);
    } catch (error) {
      this.logger.warn(
        `ménage impossible : ${error instanceof Error ? error.name : "erreur inconnue"}`,
      );
      return 0;
    }
  }
}
