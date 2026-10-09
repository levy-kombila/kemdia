import { Global, Module } from "@nestjs/common";
import { DatabaseHealth } from "./database-health.js";
import { PrismaService } from "./prisma.service.js";
import { TransactionContext } from "./transaction-context.js";

/** Connexion PostgreSQL partagée par tous les modules (une seule base, un schéma par module : ADR-0006). */
@Global()
@Module({
  providers: [PrismaService, DatabaseHealth, TransactionContext],
  exports: [PrismaService, DatabaseHealth, TransactionContext],
})
export class DatabaseModule {}
