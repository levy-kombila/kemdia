import {
  Inject,
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnModuleDestroy,
} from "@nestjs/common";
import { APP_CONFIG } from "../../../config/config.module.js";
import type { AppConfig } from "../../../config/env.js";
import { AUDIT_REPOSITORY, type AuditRepository } from "../application/ports.js";

const EVERY_MS = 6 * 60 * 60_000;
const BATCH = 1_000;
/** Au plus 50 000 lignes par passage : la purge ne monopolise jamais la base. */
const MAX_BATCHES = 50;

/**
 * Purge du journal d'audit après 365 jours (ADR-0020), toutes les 6 heures, par lots de 1 000.
 * Désactivée pendant les tests (comme le ménage du module identity).
 */
@Injectable()
export class AuditRetentionScheduler implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger("Journal d'audit");
  private timer: NodeJS.Timeout | undefined;

  constructor(
    @Inject(AUDIT_REPOSITORY) private readonly events: AuditRepository,
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
    let total = 0;
    try {
      for (let i = 0; i < MAX_BATCHES; i++) {
        const deleted = await this.events.purgeExpired(BATCH);
        total += deleted;
        if (deleted < BATCH) break;
      }
      if (total > 0) this.logger.log(`lignes de plus de 365 jours supprimées : ${total}`);
    } catch (error) {
      this.logger.warn(
        `purge impossible : ${error instanceof Error ? error.name : "erreur inconnue"}`,
      );
    }
    return total;
  }
}
