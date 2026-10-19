import { Injectable } from "@nestjs/common";
import { TransactionContext } from "../../../database/transaction-context.js";

/**
 * Données personnelles du module shipping (S7-T08, ADR-0047). Une expédition ne connaît pas le compte, seulement la
 * commande : le module `privacy` lui passe les références des commandes du compte.
 */
@Injectable()
export class ShippingPersonalData {
  constructor(private readonly tx: TransactionContext) {}

  async export(orderReferences: string[]): Promise<Record<string, unknown>> {
    if (orderReferences.length === 0) return { livraisons: [] };
    const shipments = await this.tx.db.shipment.findMany({
      where: { orderReference: { in: orderReferences } },
      orderBy: { handedOverAt: "desc" },
      select: {
        orderReference: true,
        status: true,
        cityName: true,
        attempt: true,
        failureReason: true,
        handedOverAt: true,
        events: { orderBy: { at: "asc" }, select: { status: true, note: true, at: true } },
      },
    });
    return { livraisons: shipments };
  }

  /**
   * Notes libres de l'équipe effacées (elles peuvent nommer le client) ; e-mails « en route » / « livrée » en attente
   * annulés. Statuts, dates et montants gardés.
   */
  async erase(accountId: string, orderReferences: string[]): Promise<void> {
    const db = this.tx.db;
    if (orderReferences.length > 0) {
      await db.shipment.updateMany({
        // Un échec en cours garde son motif (règle de la base) ; il bloque de toute façon l'effacement (commande en cours)
        where: { orderReference: { in: orderReferences }, status: { not: "FAILED" } },
        data: { failureReason: null },
      });
      await db.shipmentEvent.updateMany({
        where: { shipment: { orderReference: { in: orderReferences } }, note: { not: null } },
        data: { note: null },
      });
    }
    await db.shipmentEmail.updateMany({
      where: { accountId, sentAt: null },
      data: { nextAt: null },
    });
  }
}
