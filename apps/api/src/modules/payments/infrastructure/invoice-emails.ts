import {
  Inject,
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnModuleDestroy,
} from "@nestjs/common";
import { APP_CONFIG } from "../../../config/config.module.js";
import type { AppConfig } from "../../../config/env.js";
import { InvoiceService } from "../application/invoice.service.js";

const EVERY_MS = 60_000;

/**
 * Toutes les minutes : rattrapage des factures en attente, puis envoi par e-mail de celles dont c'est l'heure
 * (5 essais espacés). Désactivé pendant les tests.
 */
@Injectable()
export class InvoiceEmailScheduler implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger("Factures par e-mail");
  private timer: NodeJS.Timeout | undefined;
  private running = false;

  constructor(
    private readonly invoices: InvoiceService,
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
      const issued = await this.invoices.issueMissingInvoices();
      if (issued > 0) this.logger.log(`factures établies (rattrapage) : ${issued}`);
      const count = await this.invoices.sendPendingEmails();
      if (count > 0) this.logger.log(`factures envoyées : ${count}`);
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
