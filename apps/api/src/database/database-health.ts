import { Injectable, Logger, OnApplicationBootstrap } from "@nestjs/common";
import { PrismaService } from "./prisma.service.js";

/** Au-delà, la base est jugée indisponible (le contrôle de santé doit répondre vite). */
export const PING_TIMEOUT_MS = 2_000;

export type DatabaseStatus = "ok" | "indisponible";

/** Vérifie que PostgreSQL répond. Utilisé par `/api/health` et au démarrage. */
@Injectable()
export class DatabaseHealth implements OnApplicationBootstrap {
  private readonly logger = new Logger("Base de données");

  constructor(private readonly prisma: PrismaService) {}

  async check(): Promise<DatabaseStatus> {
    let timer: NodeJS.Timeout | undefined;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(
        () => reject(new Error(`pas de réponse en ${PING_TIMEOUT_MS} ms`)),
        PING_TIMEOUT_MS,
      );
    });
    try {
      await Promise.race([this.prisma.$queryRaw`SELECT 1`, timeout]);
      return "ok";
    } catch (error) {
      // Message du pilote uniquement (« connect ECONNREFUSED… ») : jamais l'adresse complète ni le mot de passe
      this.logger.warn(`PostgreSQL ne répond pas : ${describe(error)}`);
      return "indisponible";
    } finally {
      clearTimeout(timer);
    }
  }

  /** Au démarrage, on prévient tout de suite si la base est absente (l'API démarre quand même). */
  async onApplicationBootstrap(): Promise<void> {
    if ((await this.check()) === "ok") this.logger.log("PostgreSQL joignable");
  }
}

function describe(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  // Filet de sécurité : masque un éventuel « utilisateur:motdepasse@ » recopié par un pilote
  return message.replace(/\/\/[^@\s/]*@/g, "//***@").slice(0, 200);
}
