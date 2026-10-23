import { Injectable } from "@nestjs/common";
import { TransactionContext } from "../../../database/transaction-context.js";

/**
 * Achats vérifiés pour les avis (S8-T01, ADR-0056) : une commande du compte contenant l'une de ces offres a-t-elle été
 * LIVRÉE ? (une commande annulée, en route ou en préparation ne compte pas)
 */
@Injectable()
export class OrdersPurchases {
  constructor(private readonly tx: TransactionContext) {}

  async hasDelivered(accountId: string, productIds: readonly string[]): Promise<boolean> {
    if (!productIds.length) return false;
    const found = await this.tx.db.order.findFirst({
      where: {
        accountId,
        status: "DELIVERED",
        items: { some: { productId: { in: [...productIds] } } },
      },
      select: { id: true },
    });
    return found !== null;
  }
}
