import {
  Inject,
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnModuleDestroy,
} from "@nestjs/common";
import { APP_CONFIG } from "../../../config/config.module.js";
import type { AppConfig } from "../../../config/env.js";
import { PaymentService } from "../application/payment.service.js";

const EVERY_MS = 60_000;

/**
 * Toutes les minutes : les essais Mobile Money restés sans réponse au-delà de leur délai sont notés expirés.
 * Une seule instance de l'API au MVP ; désactivé pendant les tests.
 */
@Injectable()
export class StalePaymentsScheduler implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger("Paiements sans réponse");
  private timer: NodeJS.Timeout | undefined;
  private running = false;

  constructor(
    private readonly payments: PaymentService,
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
    if (this.running) return 0;
    this.running = true;
    try {
      const count = await this.payments.expireStale(now);
      if (count > 0) this.logger.log(`essais expirés : ${count}`);
      return count;
    } catch (error) {
      this.logger.warn(
        `passage impossible : ${error instanceof Error ? error.name : "erreur inconnue"}`,
      );
      return 0;
    } finally {
      this.running = false;
    }
  }
}
