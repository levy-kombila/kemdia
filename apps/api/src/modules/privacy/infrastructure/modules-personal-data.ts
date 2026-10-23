import { Injectable } from "@nestjs/common";
import { AuditPersonalData } from "../../audit/index.js";
import { IdentityPersonalData } from "../../identity/index.js";
import { OrdersPersonalData } from "../../orders/index.js";
import { PaymentsPersonalData } from "../../payments/index.js";
import { ReviewsPersonalData } from "../../reviews/index.js";
import { ShippingPersonalData } from "../../shipping/index.js";
import { VendorsPersonalData } from "../../vendors/index.js";
import type {
  CollectedData,
  InactiveAccount,
  LockedAccount,
  PersonalDataStore,
} from "../application/ports.js";

/**
 * Données personnelles de tous les modules (S7-T08) : chacun décrit les siennes (`XxxPersonalData`, exporté par son
 * index), ce module les assemble. Aucun autre module n'importe privacy : pas de dépendance circulaire.
 */
@Injectable()
export class ModulesPersonalData implements PersonalDataStore {
  constructor(
    private readonly identity: IdentityPersonalData,
    private readonly orders: OrdersPersonalData,
    private readonly payments: PaymentsPersonalData,
    private readonly shipping: ShippingPersonalData,
    private readonly vendors: VendorsPersonalData,
    private readonly audit: AuditPersonalData,
    private readonly reviews: ReviewsPersonalData,
  ) {}

  /** Compte puis panier (même ordre partout : pas d'interblocage avec la création d'une commande). */
  async lock(accountId: string): Promise<LockedAccount | null> {
    const account = await this.identity.lock(accountId);
    if (account) await this.orders.lock(accountId);
    return account;
  }

  async blockers(accountId: string): Promise<string[]> {
    // L'une après l'autre : une transaction Prisma n'exécute qu'une requête à la fois
    return [
      ...(await this.identity.blockers(accountId)),
      ...(await this.orders.blockers(accountId)),
      ...(await this.payments.blockers(accountId)),
      ...(await this.vendors.blockers(accountId)),
    ];
  }

  async collect(accountId: string): Promise<CollectedData> {
    const references = await this.orders.references(accountId);
    return {
      identite: await this.identity.export(accountId),
      commandes: await this.orders.export(accountId),
      paiements: await this.payments.export(accountId),
      livraisons: await this.shipping.export(references),
      boutique: await this.vendors.export(accountId),
      avis: await this.reviews.export(accountId),
      journal: await this.audit.export(accountId),
    };
  }

  /** L'identité en dernier : les autres modules peuvent encore relire le compte avant son effacement. */
  async erase(accountId: string, now: Date): Promise<void> {
    const references = await this.orders.references(accountId);
    await this.shipping.erase(accountId, references);
    await this.payments.erase(accountId, now);
    await this.orders.erase(accountId, now);
    await this.vendors.erase(accountId);
    // Avis (S8-T01) : retirés, note des fiches recalculée
    await this.reviews.erase(accountId);
    await this.identity.erase(accountId, now);
  }

  async inactiveToNotify(before: Date, limit: number): Promise<InactiveAccount[]> {
    const rows = await this.identity.inactiveToNotify(before, limit);
    return rows.map((row) => ({ id: row.id, contact: row.email ?? row.phone }));
  }

  noticedAndStillInactive(noticedBefore: Date, limit: number): Promise<string[]> {
    return this.identity.noticedAndStillInactive(noticedBefore, limit);
  }

  markNotified(accountId: string, before: Date, now: Date): Promise<boolean> {
    return this.identity.markNotified(accountId, before, now);
  }
}
