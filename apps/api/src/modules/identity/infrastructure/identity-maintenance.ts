import {
  Inject,
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnModuleDestroy,
} from "@nestjs/common";
import { APP_CONFIG } from "../../../config/config.module.js";
import type { AppConfig } from "../../../config/env.js";
import { PrismaService } from "../../../database/prisma.service.js";
import type { IdentityMaintenance } from "../application/ports.js";

const DAY_MS = 24 * 60 * 60_000;
const EVERY_MS = 60 * 60_000;

/** Supprime ce qui ne sert plus : rien d'utile n'est effacé (ADR-0017). */
@Injectable()
export class PrismaIdentityMaintenance implements IdentityMaintenance {
  constructor(private readonly prisma: PrismaService) {}

  async purgeExpired(now: Date): Promise<Record<string, number>> {
    const dayAgo = new Date(now.getTime() - DAY_MS);
    const [sessions, codes, tickets, guards] = await this.prisma.$transaction([
      // Sessions expirées, ou fermées depuis plus d'un jour
      this.prisma.session.deleteMany({
        where: { OR: [{ expiresAt: { lt: now } }, { revokedAt: { lt: dayAgo } }] },
      }),
      // Codes de plus d'un jour (les limites d'envoi ne regardent que la dernière heure)
      this.prisma.otpChallenge.deleteMany({ where: { createdAt: { lt: dayAgo } } }),
      this.prisma.signupTicket.deleteMany({ where: { expiresAt: { lt: now } } }),
      // Compteurs d'essais inactifs depuis un jour et non bloqués
      this.prisma.loginGuard.deleteMany({
        where: {
          updatedAt: { lt: dayAgo },
          OR: [{ lockedUntil: null }, { lockedUntil: { lt: now } }],
        },
      }),
    ]);
    return {
      sessions: sessions.count,
      codes: codes.count,
      tickets: tickets.count,
      compteurs: guards.count,
    };
  }
}

/** Lance le ménage une fois par heure (une seule instance de l'API au MVP). Désactivé pendant les tests. */
@Injectable()
export class IdentityCleanupScheduler implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger("Ménage identité");
  private timer: NodeJS.Timeout | undefined;

  constructor(
    private readonly maintenance: PrismaIdentityMaintenance,
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
      const counts = await this.maintenance.purgeExpired(new Date());
      if (Object.values(counts).some((n) => n > 0))
        this.logger.log(`supprimés : ${JSON.stringify(counts)}`);
    } catch (error) {
      this.logger.warn(
        `ménage impossible : ${error instanceof Error ? error.name : "erreur inconnue"}`,
      );
    }
  }
}
