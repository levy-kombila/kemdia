import { Injectable } from "@nestjs/common";
import { TransactionContext } from "../../../database/transaction-context.js";
import type { PrivacyTransaction } from "../application/ports.js";

/**
 * Transaction partagée de la base (tous les schémas) : l'effacement touche cinq modules et le journal d'audit.
 * Attente d'un verrou bornée à 5 s ; transaction entière à 30 s (un compte avec beaucoup de commandes).
 */
const LOCK_TIMEOUT = "5s";
const OPTIONS = { maxWait: 5_000, timeout: 30_000 };

@Injectable()
export class PrismaPrivacyTransaction implements PrivacyTransaction {
  constructor(private readonly tx: TransactionContext) {}

  run<T>(work: () => Promise<T>): Promise<T> {
    return this.tx.run(async () => {
      await this.tx.db.$executeRawUnsafe(`SET LOCAL lock_timeout = '${LOCK_TIMEOUT}'`);
      return work();
    }, OPTIONS);
  }
}
