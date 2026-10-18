import {
  Inject,
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnModuleDestroy,
} from "@nestjs/common";
import { APP_CONFIG } from "../../../config/config.module.js";
import type { AppConfig } from "../../../config/env.js";
import { ShipmentNotifier } from "../application/shipment-notifier.service.js";

const EVERY_MS = 60_000;

/** Toutes les minutes : e-mails de livraison aux clients (S7-T02). Désactivé pendant les tests. */
@Injectable()
export class ShipmentEmailScheduler implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger("Livraisons (e-mails)");
  private timer: NodeJS.Timeout | undefined;
  private running = false;

  constructor(
    private readonly notifier: ShipmentNotifier,
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

  async run(): Promise<number> {
    if (this.running) return 0;
    this.running = true;
    try {
      const count = await this.notifier.sendPending();
      if (count > 0) this.logger.log(`e-mails de livraison envoyés : ${count}`);
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
