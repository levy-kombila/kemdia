import { Inject, Injectable } from "@nestjs/common";
import { AuditLog, type AuditContext } from "../../audit/index.js";
import { OrderPayments } from "../../orders/index.js";
import {
  BILLING_SETTINGS_REPOSITORY,
  type BillingSettingsRecord,
  type BillingSettingsRepository,
} from "./ports.js";

/**
 * Informations de l'entreprise imprimées sur les factures (S5-T06, ADR-0028) : valeurs de départ PROVISOIRES
 * (« à compléter »), changées par un administrateur. Chaque facture en garde une copie figée : un changement ne
 * modifie jamais une facture déjà émise. Chaque changement au journal d'audit.
 */
@Injectable()
export class BillingSettingsService {
  clock: () => Date = () => new Date();

  constructor(
    private readonly orders: OrderPayments,
    @Inject(BILLING_SETTINGS_REPOSITORY) private readonly settings: BillingSettingsRepository,
    @Inject(AuditLog) private readonly audit: Pick<AuditLog, "record">,
  ) {}

  get(): Promise<BillingSettingsRecord> {
    return this.settings.get();
  }

  update(
    adminId: string,
    input: Omit<BillingSettingsRecord, "updatedAt">,
    context: AuditContext,
  ): Promise<BillingSettingsRecord> {
    return this.orders.transaction(async () => {
      const saved = await this.settings.save(input, adminId, this.clock());
      await this.audit.record({
        action: "settings.billing_updated",
        actor: { type: "account", id: adminId },
        target: null,
        details: { legalName: input.legalName.slice(0, 100), taxId: input.taxId.slice(0, 100) },
        context,
      });
      return saved;
    });
  }
}
