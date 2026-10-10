import { Injectable } from "@nestjs/common";
import { DEFAULT_COD_RULE, ZONES, type ZoneId } from "@kemdia/contracts/delivery";
import { TransactionContext } from "../../../database/transaction-context.js";
import type { CodSettingsRecord, CodSettingsRepository } from "../application/ports.js";

const KNOWN = new Set<string>(Object.keys(ZONES));
const zonesOf = (raw: readonly string[]): ZoneId[] => raw.filter((z): z is ZoneId => KNOWN.has(z));

/**
 * Réglage du paiement à la livraison (table `orders.cod_settings`, une seule ligne posée par la migration). Si la ligne
 * manquait, valeurs par défaut du contrat (jamais d'erreur au moment de commander).
 */
@Injectable()
export class PrismaCodSettingsRepository implements CodSettingsRepository {
  constructor(private readonly tx: TransactionContext) {}

  async get(): Promise<CodSettingsRecord> {
    const row = await this.tx.db.codSettings.findUnique({ where: { id: 1 } });
    if (!row)
      return {
        zones: [...DEFAULT_COD_RULE.zones],
        maxTotal: DEFAULT_COD_RULE.maxTotal,
        updatedAt: null,
      };
    return { zones: zonesOf(row.zones), maxTotal: row.maxTotal, updatedAt: row.updatedAt };
  }

  async save(
    settings: { zones: ZoneId[]; maxTotal: number },
    adminId: string,
    now: Date,
  ): Promise<CodSettingsRecord> {
    const data = {
      zones: settings.zones,
      maxTotal: settings.maxTotal,
      updatedBy: adminId,
      updatedAt: now,
    };
    const row = await this.tx.db.codSettings.upsert({
      where: { id: 1 },
      create: { id: 1, ...data },
      update: data,
    });
    return { zones: zonesOf(row.zones), maxTotal: row.maxTotal, updatedAt: row.updatedAt };
  }
}
