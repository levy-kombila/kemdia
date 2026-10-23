import { Injectable } from "@nestjs/common";
import { TransactionContext } from "../../../database/transaction-context.js";
import type { ReviewsTransaction } from "../application/ports.js";

/** Transaction des avis : celle de la base, partagée avec la fiche (note moyenne) et le journal d'audit. */
@Injectable()
export class ReviewsTransactionRunner implements ReviewsTransaction {
  constructor(private readonly tx: TransactionContext) {}

  run<T>(work: () => Promise<T>): Promise<T> {
    return this.tx.run(work);
  }
}
