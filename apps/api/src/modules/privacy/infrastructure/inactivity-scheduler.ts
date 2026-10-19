import {
  Inject,
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnModuleDestroy,
} from "@nestjs/common";
import { APP_CONFIG } from "../../../config/config.module.js";
import type { AppConfig } from "../../../config/env.js";
import { PrivacyService } from "../application/privacy.service.js";

/** Vérifié toutes les heures ; le passage n'a lieu qu'une fois par nuit, à 2 h à Libreville (1 h UTC). */
const EVERY_MS = 3_600_000;
const NIGHT_HOUR_UTC = 1;

/**
 * Comptes inactifs (S7-T08, ADR-0047) : prévenus 30 jours avant, effacés après 3 ans sans connexion.
 * Désactivé pendant les tests (comme les autres tâches planifiées).
 */
@Injectable()
export class InactivityScheduler implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger("Données personnelles");
  private timer: NodeJS.Timeout | undefined;
  private running = false;

  constructor(
    private readonly privacy: PrivacyService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  onApplicationBootstrap(): void {
    if (this.config.NODE_ENV === "test") return;
    this.timer = setInterval(() => {
      if (new Date().getUTCHours() === NIGHT_HOUR_UTC) void this.run();
    }, EVERY_MS);
    this.timer.unref();
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  async run(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      const { notified, erased, blocked } = await this.privacy.processInactiveAccounts();
      if (notified + erased + blocked > 0) {
        this.logger.log(
          `comptes inactifs : ${notified} prévenus, ${erased} effacés, ${blocked} gardés (commande, boutique…)`,
        );
      }
    } catch (error) {
      this.logger.warn(
        `passage impossible : ${error instanceof Error ? error.name : "erreur inconnue"}`,
      );
    } finally {
      this.running = false;
    }
  }
}
