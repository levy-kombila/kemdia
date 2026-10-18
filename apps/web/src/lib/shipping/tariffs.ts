import "server-only";
import type { DeliveryTariffTable } from "@kemdia/contracts/delivery";
import { catalogSource } from "@/lib/config/server-config";
import { createTariffSource, type TariffSource } from "./api-tariffs";

let instance: TariffSource | undefined;

/** Barème de livraison en vigueur (estimation d'affichage ; l'API calcule le montant facturé). */
export function deliveryTariffs(): Promise<DeliveryTariffTable> {
  instance ??= createTariffSource(catalogSource());
  return instance.current();
}
