import { Injectable } from "@nestjs/common";
import { ZONES } from "@kemdia/contracts/delivery";
import { TransactionContext } from "../../../database/transaction-context.js";
import type { TariffRecord, TariffRepository } from "../application/ports.js";
import { ZONE_IDS, type ZoneId, type ZoneTariff } from "../domain/shipment.js";

const isZone = (id: string): id is ZoneId => (ZONE_IDS as readonly string[]).includes(id);

/**
 * Barème (table `shipping.delivery_tariffs`, une ligne par zone posée par la migration). Une zone absente prend la
 * valeur du contrat : jamais d'erreur au moment de commander.
 */
@Injectable()
export class PrismaTariffRepository implements TariffRepository {
  constructor(private readonly tx: TransactionContext) {}

  async get(): Promise<TariffRecord> {
    const rows = await this.tx.db.deliveryTariff.findMany();
    const byId = new Map(rows.filter((r) => isZone(r.zoneId)).map((r) => [r.zoneId, r]));
    let updatedAt: Date | null = null;
    const zones: ZoneTariff[] = ZONE_IDS.map((id) => {
      const row = byId.get(id);
      if (!row) {
        const { baseFee, freeThreshold, daysMin, daysMax } = ZONES[id];
        return { id, baseFee, freeThreshold, daysMin, daysMax };
      }
      if (row.updatedAt && (!updatedAt || row.updatedAt > updatedAt)) updatedAt = row.updatedAt;
      return {
        id,
        baseFee: row.baseFee,
        freeThreshold: row.freeThreshold,
        daysMin: row.daysMin,
        daysMax: row.daysMax,
      };
    });
    return { zones, updatedAt };
  }

  async save(zones: readonly ZoneTariff[], adminId: string, now: Date): Promise<TariffRecord> {
    for (const zone of zones) {
      const data = {
        baseFee: zone.baseFee,
        freeThreshold: zone.freeThreshold,
        daysMin: zone.daysMin,
        daysMax: zone.daysMax,
        updatedBy: adminId,
        updatedAt: now,
      };
      await this.tx.db.deliveryTariff.upsert({
        where: { zoneId: zone.id },
        create: { zoneId: zone.id, ...data },
        update: data,
      });
    }
    return this.get();
  }
}
