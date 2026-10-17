import { Inject, Injectable, type OnModuleInit } from "@nestjs/common";
import { ZONES, type DeliveryTariffTable } from "@kemdia/contracts/delivery";
import { AuditLog, type AuditContext } from "../../audit/index.js";
import { DeliveryTariffs } from "../../orders/index.js";
import { validateTariffs, type ZoneTariff } from "../domain/shipment.js";
import {
  SHIPPING_TRANSACTION,
  TARIFF_REPOSITORY,
  type ShippingTransaction,
  type TariffRecord,
  type TariffRepository,
} from "./ports.js";

/**
 * Barème de livraison des zones (S7-T01, ADR-0040), changé par un administrateur sans redéployer (choix du
 * 2026-10-17). Au démarrage, le module s'inscrit auprès du module orders : le devis et la commande lisent ce barème,
 * dans leur propre transaction. Les noms des zones et les suppléments par ville restent dans le contrat.
 */
@Injectable()
export class TariffService implements OnModuleInit {
  /** Horloge (remplaçable dans les tests). */
  clock: () => Date = () => new Date();

  constructor(
    @Inject(TARIFF_REPOSITORY) private readonly tariffs: TariffRepository,
    @Inject(SHIPPING_TRANSACTION) private readonly tx: ShippingTransaction,
    @Inject(AuditLog) private readonly audit: Pick<AuditLog, "record">,
    private readonly orders: DeliveryTariffs,
  ) {}

  onModuleInit(): void {
    this.orders.use(async () => tableOf((await this.tariffs.get()).zones));
  }

  get(): Promise<TariffRecord> {
    return this.tariffs.get();
  }

  update(
    adminId: string,
    input: readonly ZoneTariff[],
    context: AuditContext,
  ): Promise<TariffRecord> {
    const zones = validateTariffs(input);
    return this.tx.run(async () => {
      const saved = await this.tariffs.save(zones, adminId, this.clock());
      await this.audit.record({
        action: "settings.delivery_updated",
        actor: { type: "account", id: adminId },
        target: null,
        // « zone1: 0/25000/1-2 » : frais de base / livraison offerte dès / délais (clés du journal : lettres et chiffres)
        details: Object.fromEntries(
          zones.map((z) => [
            z.id.replace("_", ""),
            `${z.baseFee}/${z.freeThreshold}/${z.daysMin}-${z.daysMax}`,
          ]),
        ),
        context,
      });
      return saved;
    });
  }
}

/** Barème complet (noms des zones du contrat) à partir des valeurs réglées. */
export function tableOf(zones: readonly ZoneTariff[]): DeliveryTariffTable {
  const table = { ...ZONES };
  for (const zone of zones) {
    table[zone.id] = Object.freeze({ ...ZONES[zone.id], ...zone });
  }
  return Object.freeze(table);
}
