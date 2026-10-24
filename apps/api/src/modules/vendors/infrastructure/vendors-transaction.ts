import { Injectable } from "@nestjs/common";
import { TransactionContext } from "../../../database/transaction-context.js";
import type { VendorsTransaction } from "../application/ports.js";
import { VendorsError } from "../domain/vendors-error.js";

/**
 * Transaction des boutiques : celle de la base, partagée avec le module identity (rôle vendeur) et le journal d'audit.
 * Attente d'un verrou bornée à 3 s, transaction entière à 10 s : au-delà, `BOUTIQUE_OCCUPEE` (409, « réessayez ») plutôt qu'une connexion
 * bloquée (même réglage que les commandes, S5-T02).
 */
const LOCK_TIMEOUT = "3s";
const OPTIONS = { maxWait: 3_000, timeout: 10_000 };

function isBusy(error: unknown): boolean {
  const code = (error as { code?: unknown } | null)?.code;
  const meta = (error as { meta?: { driverAdapterError?: { cause?: { originalCode?: unknown } } } })
    ?.meta;
  return (
    meta?.driverAdapterError?.cause?.originalCode === "55P03" ||
    code === "P2028" ||
    code === "P2024"
  );
}

@Injectable()
export class VendorsTransactionRunner implements VendorsTransaction {
  constructor(private readonly tx: TransactionContext) {}

  async run<T>(work: () => Promise<T>, options?: { timeoutMs?: number }): Promise<T> {
    try {
      return await this.tx.run(
        async () => {
          await this.tx.db.$executeRawUnsafe(`SET LOCAL lock_timeout = '${LOCK_TIMEOUT}'`);
          return work();
        },
        options?.timeoutMs ? { ...OPTIONS, timeout: options.timeoutMs } : OPTIONS,
      );
    } catch (error) {
      // Transaction longue demandée (import du catalogue) et dépassée : ce n'est pas une boutique occupée
      if (options?.timeoutMs && (error as { code?: unknown } | null)?.code === "P2028") {
        throw new VendorsError(
          "IMPORT_TROP_LONG",
          "l'écriture a dépassé le temps permis : rien n'a été importé, découpez le fichier",
        );
      }
      if (isBusy(error)) {
        throw new VendorsError(
          "BOUTIQUE_OCCUPEE",
          "une autre opération est en cours sur cette boutique : réessayez dans un instant",
        );
      }
      throw error;
    }
  }
}
