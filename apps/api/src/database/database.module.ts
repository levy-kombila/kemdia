import { Global, Module } from "@nestjs/common";
import { DatabaseHealth } from "./database-health.js";
import { PrismaService } from "./prisma.service.js";
import { RATE_COUNTERS, rateCountersProvider } from "./rate-counters.js";
import { RateCountersCleanup } from "./rate-counters-cleanup.js";
import { TransactionContext } from "./transaction-context.js";

/**
 * Connexion PostgreSQL partagée par tous les modules (une seule base, un schéma par module : ADR-0006), et compteurs
 * partagés par les instances de l'API (S8-T07, ADR-0064).
 */
@Global()
@Module({
  providers: [
    PrismaService,
    DatabaseHealth,
    TransactionContext,
    rateCountersProvider,
    RateCountersCleanup,
  ],
  exports: [PrismaService, DatabaseHealth, TransactionContext, RATE_COUNTERS],
})
export class DatabaseModule {}
