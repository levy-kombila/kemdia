import {
  Inject,
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnModuleDestroy,
} from "@nestjs/common";
import { APP_CONFIG } from "../../../config/config.module.js";
import type { AppConfig } from "../../../config/env.js";
import { PROBLEM_REPOSITORY, type ProblemRepository } from "../application/ports.js";
import { PROBLEM_RULES } from "../domain/problem-report.js";

const DAY_MS = 24 * 60 * 60_000;
const EVERY_MS = 6 * 60 * 60_000;

/**
 * Minimisation (ADR-0047) : un signalement résolu depuis 180 jours est effacé. Toutes les 6 heures, une seule
 * instance de l'API au MVP ; désactivé pendant les tests.
 */
@Injectable()
export class FeedbackCleanupScheduler implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger("Ménage signalements");
  private timer: NodeJS.Timeout | undefined;

  constructor(
    @Inject(PROBLEM_REPOSITORY) private readonly problems: ProblemRepository,
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
      const before = new Date(now.getTime() - PROBLEM_RULES.resolvedRetentionDays * DAY_MS);
      const count = await this.problems.purgeResolvedBefore(before);
      if (count > 0) this.logger.log(`${count} signalement(s) résolu(s) effacé(s)`);
      return count;
    } catch (error) {
      this.logger.warn(
        `ménage impossible : ${error instanceof Error ? error.message.slice(0, 200) : "erreur inconnue"}`,
      );
      return 0;
    }
  }
}
