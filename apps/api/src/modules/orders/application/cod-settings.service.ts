import { Inject, Injectable } from "@nestjs/common";
import { ZONES, type ZoneId } from "@kemdia/contracts/delivery";
import { AuditLog, type AuditContext } from "../../audit/index.js";
import {
  COD_SETTINGS_REPOSITORY,
  ORDERS_TRANSACTION,
  type CodSettingsRecord,
  type CodSettingsRepository,
  type OrdersTransaction,
} from "./ports.js";

/** Total maximum réglable (10 millions de FCFA) : au-delà, une faute de frappe plutôt qu'un choix. */
export const COD_MAX_TOTAL_LIMIT = 10_000_000;

/**
 * Réglage du paiement à la livraison (S5-T04, ADR-0026 ; BR-011, question ouverte n° 1) : zones et total maximum,
 * changés par un administrateur sans redéployer. Le devis et la commande lisent ce réglage. Chaque changement est
 * inscrit au journal d'audit dans la même transaction.
 */
@Injectable()
export class CodSettingsService {
  /** Horloge (remplaçable dans les tests). */
  clock: () => Date = () => new Date();

  constructor(
    @Inject(COD_SETTINGS_REPOSITORY) private readonly settings: CodSettingsRepository,
    @Inject(ORDERS_TRANSACTION) private readonly tx: OrdersTransaction,
    @Inject(AuditLog) private readonly audit: Pick<AuditLog, "record">,
  ) {}

  get(): Promise<CodSettingsRecord> {
    return this.settings.get();
  }

  async update(
    adminId: string,
    input: { zones: readonly ZoneId[]; maxTotal: number },
    context: AuditContext,
  ): Promise<CodSettingsRecord> {
    if (
      !Number.isSafeInteger(input.maxTotal) ||
      input.maxTotal < 0 ||
      input.maxTotal > COD_MAX_TOTAL_LIMIT
    ) {
      throw new RangeError("total maximum : nombre entier de FCFA, 10 000 000 au plus");
    }
    // Zones connues, sans doublon, dans l'ordre des zones
    const zones = (Object.keys(ZONES) as ZoneId[]).filter((z) => input.zones.includes(z));
    return this.tx.run(async () => {
      const saved = await this.settings.save(
        { zones, maxTotal: input.maxTotal },
        adminId,
        this.clock(),
      );
      await this.audit.record({
        action: "settings.cod_updated",
        actor: { type: "account", id: adminId },
        target: null,
        details: { zones: zones.length > 0 ? zones.join(",") : "aucune", maxTotal: input.maxTotal },
        context,
      });
      return saved;
    });
  }
}
