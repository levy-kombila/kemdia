import { Injectable } from "@nestjs/common";
import { TransactionContext } from "../../../database/transaction-context.js";
import type { TransactionRunner } from "../application/ports.js";

/** TransactionRunner du module identity : la transaction partagée de la base (src/database). */
@Injectable()
export class PrismaTransactionRunner implements TransactionRunner {
  constructor(private readonly tx: TransactionContext) {}

  run<T>(work: () => Promise<T>): Promise<T> {
    return this.tx.run(work);
  }
}
