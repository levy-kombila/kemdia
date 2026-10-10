import {
  Inject,
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnModuleDestroy,
} from "@nestjs/common";
import { APP_CONFIG } from "../../../config/config.module.js";
import type { AppConfig } from "../../../config/env.js";
import { CartService } from "../application/cart.service.js";
import { CART_TTL_DAYS } from "../domain/cart.js";

const DAY_MS = 24 * 60 * 60_000;
const EVERY_MS = 60 * 60_000;
/** Premier ménage peu après le démarrage : la démo gratuite s'endort souvent avant une heure de fonctionnement. */
const FIRST_RUN_MS = 5 * 60_000;

/**
 * Supprime une fois par heure les paniers sans activité depuis 90 jours (choix du 2026-10-10).
 * Une seule instance de l'API au MVP ; désactivé pendant les tests.
 */
@Injectable()
export class CartCleanupScheduler implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger("Ménage paniers");
  private timer: NodeJS.Timeout | undefined;
  private first: NodeJS.Timeout | undefined;

  constructor(
    private readonly carts: CartService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  onApplicationBootstrap(): void {
    if (this.config.NODE_ENV === "test") return;
    this.first = setTimeout(() => void this.run(), FIRST_RUN_MS);
    this.first.unref();
    this.timer = setInterval(() => void this.run(), EVERY_MS);
    this.timer.unref();
  }

  onModuleDestroy(): void {
    if (this.first) clearTimeout(this.first);
    if (this.timer) clearInterval(this.timer);
  }

  async run(now = new Date()): Promise<number> {
    try {
      const count = await this.carts.purgeInactive(
        new Date(now.getTime() - CART_TTL_DAYS * DAY_MS),
      );
      if (count > 0) this.logger.log(`paniers abandonnés supprimés : ${count}`);
      return count;
    } catch (error) {
      this.logger.warn(
        `ménage impossible : ${error instanceof Error ? error.name : "erreur inconnue"}`,
      );
      return 0;
    }
  }
}
