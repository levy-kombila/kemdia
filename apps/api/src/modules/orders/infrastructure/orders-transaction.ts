import { Injectable } from "@nestjs/common";
import { TransactionContext } from "../../../database/transaction-context.js";
import type { OrdersTransaction } from "../application/ports.js";
import { busyError, isBusy } from "./postgres-errors.js";

/**
 * Transaction des commandes : celle de la base, partagée avec le catalogue (réservation du stock) et le panier.
 * Attente de chaque verrou bornée à 3 s, de la connexion à 3 s, transaction entière à 10 s : au-delà, `PANIER_OCCUPE`
 * (réessayer) plutôt qu'une connexion bloquée ou une erreur 500 (relecture de sécurité du S5-T02).
 */
const LOCK_TIMEOUT = "3s";
const OPTIONS = { maxWait: 3_000, timeout: 10_000 };

@Injectable()
export class OrdersTransactionRunner implements OrdersTransaction {
  constructor(private readonly tx: TransactionContext) {}

  async run<T>(work: () => Promise<T>): Promise<T> {
    try {
      return await this.tx.run(async () => {
        await this.tx.db.$executeRawUnsafe(`SET LOCAL lock_timeout = '${LOCK_TIMEOUT}'`);
        return work();
      }, OPTIONS);
    } catch (error) {
      if (isBusy(error)) throw busyError();
      throw error;
    }
  }
}
