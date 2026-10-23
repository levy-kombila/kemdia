import { Injectable } from "@nestjs/common";
import { TransactionContext } from "../../../database/transaction-context.js";
import type { FeedbackTransaction } from "../application/ports.js";

/** Transaction des signalements : celle de la base, partagée avec le journal d'audit. */
@Injectable()
export class FeedbackTransactionRunner implements FeedbackTransaction {
  constructor(private readonly tx: TransactionContext) {}

  run<T>(work: () => Promise<T>): Promise<T> {
    return this.tx.run(work);
  }
}
