import { Inject, Injectable, OnModuleDestroy } from "@nestjs/common";
import { PrismaPg } from "@prisma/adapter-pg";
import { APP_CONFIG } from "../config/config.module.js";
import type { AppConfig } from "../config/env.js";
import { PrismaClient } from "../generated/prisma/client.js";

/** Délai maximal pour ouvrir une connexion : au-delà, la requête échoue au lieu d'attendre indéfiniment. */
export const CONNECTION_TIMEOUT_MS = 5_000;

/**
 * Accès à PostgreSQL pour les couches `infrastructure/` des modules (jamais pour `domain/` ni `application/`).
 *
 * Prisma 7 passe par le pilote `pg` (adaptateur) : aucun moteur natif à l'exécution.
 * La connexion s'ouvre à la première requête ; l'API démarre donc même si la base est momentanément absente,
 * et `/api/health` le signale.
 */
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleDestroy {
  constructor(@Inject(APP_CONFIG) config: AppConfig) {
    super({
      adapter: new PrismaPg({
        connectionString: config.DATABASE_URL,
        max: config.DATABASE_POOL_MAX,
        connectionTimeoutMillis: CONNECTION_TIMEOUT_MS,
        idleTimeoutMillis: 30_000,
        statement_timeout: config.DATABASE_STATEMENT_TIMEOUT_MS,
        // Visible dans pg_stat_activity : on sait d'où vient chaque connexion
        application_name: `kemdia-api-${config.APP_ENV}`,
      }),
    });
  }

  /** Arrêt propre (redéploiement) : les connexions sont rendues à PostgreSQL. */
  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
