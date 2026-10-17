import { Injectable } from "@nestjs/common";
import { TransactionContext } from "../../../database/transaction-context.js";
import type { ShippingTransaction } from "../application/ports.js";

/** Transaction du barème : celle de la base, partagée avec le journal d'audit (ADR-0020). */
@Injectable()
export class ShippingTransactionRunner implements ShippingTransaction {
  constructor(private readonly tx: TransactionContext) {}

  run<T>(work: () => Promise<T>): Promise<T> {
    return this.tx.run(work);
  }
}
