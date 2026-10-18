import type { DeliveryTariffs } from "@kemdia/contracts";
import { ZONES, type DeliveryTariffTable, type ZoneId } from "@kemdia/contracts/delivery";

/**
 * Barème des zones (S7-T02) : réponse de l'API → table utilisée par `estimateDelivery`. Les noms des zones restent ceux
 * du contrat ; une zone absente garde la valeur du contrat. Fichier sans `server-only` : le navigateur l'utilise aussi.
 */
export function tariffTableOf(tariffs: DeliveryTariffs | null): DeliveryTariffTable {
  if (!tariffs) return ZONES;
  const table: Record<ZoneId, DeliveryTariffTable[ZoneId]> = { ...ZONES };
  for (const zone of tariffs.zones) {
    const { baseFee, freeThreshold, daysMin, daysMax } = zone;
    table[zone.id] = { ...ZONES[zone.id], baseFee, freeThreshold, daysMin, daysMax };
  }
  return table;
}
