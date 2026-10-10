import {
  Inject,
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnModuleDestroy,
} from "@nestjs/common";
import { APP_CONFIG } from "../../../config/config.module.js";
import type { AppConfig } from "../../../config/env.js";
import { OrderService } from "../application/order.service.js";

const EVERY_MS = 60_000;

/**
 * Toutes les minutes : les commandes Mobile Money non payées dans les 30 minutes sont annulées et leur stock remis en
 * vente (choix du 2026-10-10). Une seule instance de l'API au MVP ; désactivé pendant les tests.
 */
@Injectable()
export class OverdueOrdersScheduler implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger("Commandes non payées");
  private timer: NodeJS.Timeout | undefined;
  private running = false;

  constructor(
    private readonly orders: OrderService,
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
    // Un passage à la fois (un passage lent ne se superpose pas au suivant)
    if (this.running) return 0;
    this.running = true;
    try {
      const count = await this.orders.cancelOverdue(now);
      if (count > 0) this.logger.log(`commandes annulées (paiement non reçu) : ${count}`);
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
