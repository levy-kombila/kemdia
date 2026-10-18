import { Injectable } from "@nestjs/common";
import { TransactionContext } from "../../../database/transaction-context.js";
import type { $Enums } from "../../../generated/prisma/client.js";
import type {
  ShipmentEmailKind,
  ShipmentEmailOutbox,
  ShipmentEmailRecord,
} from "../application/ports.js";
import { MAX_EMAIL_ATTEMPTS } from "../application/shipment-notifier.service.js";
import type { ShipmentStatus } from "../domain/shipment.js";

const KIND_TO_DB: Record<ShipmentEmailKind, $Enums.ShipmentEmailKind> = {
  handed_over: "HANDED_OVER",
  delivered: "DELIVERED",
};
const KIND_FROM_DB = Object.fromEntries(
  Object.entries(KIND_TO_DB).map(([k, v]) => [v, k]),
) as Record<$Enums.ShipmentEmailKind, ShipmentEmailKind>;
const STATUS_FROM_DB: Record<$Enums.ShipmentStatus, ShipmentStatus> = {
  IN_TRANSIT: "in_transit",
  DELIVERED: "delivered",
  FAILED: "failed",
  CANCELLED: "cancelled",
};

/** File des e-mails de livraison (`shipping.shipment_emails`) ; la réservation est conditionnelle. */
@Injectable()
export class PrismaShipmentEmailOutbox implements ShipmentEmailOutbox {
  constructor(private readonly tx: TransactionContext) {}

  async enqueue(email: {
    id: string;
    shipmentId: string;
    kind: ShipmentEmailKind;
    accountId: string;
    orderReference: string;
    now: Date;
  }): Promise<void> {
    await this.tx.db.shipmentEmail.createMany({
      data: [
        {
          id: email.id,
          shipmentId: email.shipmentId,
          kind: KIND_TO_DB[email.kind],
          accountId: email.accountId,
          orderReference: email.orderReference,
          nextAt: email.now,
          createdAt: email.now,
        },
      ],
      // Même étape notée deux fois (ex. livrée, puis relue) : un seul e-mail
      skipDuplicates: true,
    });
  }

  async due(now: Date, limit: number): Promise<ShipmentEmailRecord[]> {
    const rows = await this.tx.db.shipmentEmail.findMany({
      where: { sentAt: null, nextAt: { lte: now }, attempts: { lt: MAX_EMAIL_ATTEMPTS } },
      orderBy: { nextAt: "asc" },
      take: limit,
      include: { shipment: { select: { status: true, cityName: true } } },
    });
    return rows.map((r) => ({
      id: r.id,
      kind: KIND_FROM_DB[r.kind],
      accountId: r.accountId,
      orderReference: r.orderReference,
      attempts: r.attempts,
      shipmentStatus: STATUS_FROM_DB[r.shipment.status],
      cityName: r.shipment.cityName,
    }));
  }

  async claim(id: string, now: Date, nextAt: Date): Promise<boolean> {
    // Conditionnelle : deux instances ne prennent jamais le même envoi
    const { count } = await this.tx.db.shipmentEmail.updateMany({
      where: { id, sentAt: null, nextAt: { lte: now }, attempts: { lt: MAX_EMAIL_ATTEMPTS } },
      data: { attempts: { increment: 1 }, nextAt },
    });
    return count === 1;
  }

  async markSent(id: string, now: Date): Promise<void> {
    await this.tx.db.shipmentEmail.updateMany({
      where: { id },
      data: { sentAt: now, nextAt: null },
    });
  }

  async giveUp(id: string): Promise<void> {
    await this.tx.db.shipmentEmail.updateMany({
      where: { id, sentAt: null },
      data: { nextAt: null },
    });
  }
}
