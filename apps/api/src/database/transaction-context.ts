import { AsyncLocalStorage } from "node:async_hooks";
import { Injectable } from "@nestjs/common";
import type { Prisma } from "../generated/prisma/client.js";
import { PrismaService } from "./prisma.service.js";

/** Client Prisma utilisable dans ou hors d'une transaction. */
export type DbClient = Prisma.TransactionClient;

/**
 * Transaction partagée entre modules (S4-T06, ADR-0020) : une action et sa ligne du journal d'audit
 * sont écrites ENSEMBLE ou pas du tout, même si elles appartiennent à deux modules (deux schémas d'une même base).
 *
 * - `run(fn)` ouvre une transaction et l'associe à tout le code appelé par `fn` (AsyncLocalStorage) ;
 *   un `run` imbriqué rejoint la transaction en cours au lieu d'en ouvrir une autre.
 * - `db` est le client à utiliser dans les dépôts : la transaction en cours s'il y en a une, sinon la connexion normale.
 *
 * Réservé aux couches `infrastructure/` (et aux fichiers d'assemblage des modules), comme PrismaService.
 */
@Injectable()
export class TransactionContext {
  private readonly current = new AsyncLocalStorage<DbClient>();

  constructor(private readonly prisma: PrismaService) {}

  get db(): DbClient {
    return this.current.getStore() ?? this.prisma;
  }

  /** Vrai si le code s'exécute dans une transaction ouverte par `run`. */
  get active(): boolean {
    return this.current.getStore() !== undefined;
  }

  /**
   * `options` (S5-T02) : attente maximale d'une connexion (`maxWait`) et durée maximale de la transaction (`timeout`),
   * en millisecondes ; par défaut ceux de Prisma (2 s et 5 s). Ignorées si la transaction est déjà ouverte.
   */
  run<T>(work: () => Promise<T>, options?: { maxWait?: number; timeout?: number }): Promise<T> {
    if (this.active) return work();
    return this.prisma.$transaction((tx) => this.current.run(tx, work), options);
  }
}
