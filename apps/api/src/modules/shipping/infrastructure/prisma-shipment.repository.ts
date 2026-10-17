import { Injectable } from "@nestjs/common";
import { TransactionContext } from "../../../database/transaction-context.js";
import type { $Enums, Prisma } from "../../../generated/prisma/client.js";
import type {
  NewShipment,
  ShipmentChange,
  ShipmentEventRecord,
  ShipmentRecord,
  ShipmentRepository,
} from "../application/ports.js";
import type { ShipmentStatus } from "../domain/shipment.js";

const TO_DB: Record<ShipmentStatus, $Enums.ShipmentStatus> = {
  in_transit: "IN_TRANSIT",
  delivered: "DELIVERED",
  failed: "FAILED",
  cancelled: "CANCELLED",
};
const FROM_DB = Object.fromEntries(Object.entries(TO_DB).map(([k, v]) => [v, k])) as Record<
  $Enums.ShipmentStatus,
  ShipmentStatus
>;

const withEvents = {
  events: { orderBy: [{ at: "asc" }, { id: "asc" }] },
} as const satisfies Prisma.ShipmentInclude;
type Row = Prisma.ShipmentGetPayload<{ include: typeof withEvents }>;

function toRecord(row: Row): ShipmentRecord {
  return {
    id: row.id,
    orderId: row.orderId,
    orderReference: row.orderReference,
    status: FROM_DB[row.status],
    carrier: row.carrier,
    attempt: row.attempt,
    cityName: row.cityName,
    deliveryFee: row.deliveryFee,
    kemdiaShare: row.kemdiaShare,
    carrierShare: row.carrierShare,
    failureReason: row.failureReason,
    handedOverAt: row.handedOverAt,
    updatedAt: row.updatedAt,
    events: row.events.map((e) => ({
      status: FROM_DB[e.status],
      at: e.at,
      note: e.note,
      actorId: e.actorId,
    })),
  };
}

/** Expéditions (schéma `shipping`) ; règles posées en SQL : parts des frais, passages de statut, champs figés. */
@Injectable()
export class PrismaShipmentRepository implements ShipmentRepository {
  constructor(private readonly tx: TransactionContext) {}

  async findByReference(reference: string, lock = false): Promise<ShipmentRecord | null> {
    const db = this.tx.db;
    if (lock) {
      const rows = await db.$queryRaw<{ id: string }[]>`
        SELECT "id" FROM "shipping"."shipments" WHERE "order_reference" = ${reference} FOR UPDATE`;
      if (!rows[0]) return null;
    }
    const row = await db.shipment.findUnique({
      where: { orderReference: reference },
      include: withEvents,
    });
    return row ? toRecord(row) : null;
  }

  async create(
    shipment: NewShipment,
    event: ShipmentEventRecord & { id: string },
  ): Promise<ShipmentRecord> {
    const row = await this.tx.db.shipment.create({
      data: {
        ...shipment,
        status: "IN_TRANSIT",
        attempt: 1,
        events: {
          create: {
            id: event.id,
            status: TO_DB[event.status],
            note: event.note,
            actorId: event.actorId,
            at: event.at,
          },
        },
      },
      include: withEvents,
    });
    return toRecord(row);
  }

  async update(
    id: string,
    change: ShipmentChange,
    event: ShipmentEventRecord & { id: string },
  ): Promise<ShipmentRecord> {
    const row = await this.tx.db.shipment.update({
      where: { id },
      data: {
        status: TO_DB[change.status],
        attempt: change.attempt,
        failureReason: change.failureReason,
        updatedAt: event.at,
        events: {
          create: {
            id: event.id,
            status: TO_DB[event.status],
            note: event.note,
            actorId: event.actorId,
            at: event.at,
          },
        },
      },
      include: withEvents,
    });
    return toRecord(row);
  }

  async list(status: ShipmentStatus, limit: number): Promise<ShipmentRecord[]> {
    const rows = await this.tx.db.shipment.findMany({
      where: { status: TO_DB[status] },
      orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
      take: limit,
      include: withEvents,
    });
    return rows.map(toRecord);
  }
}
