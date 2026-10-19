import { Injectable } from "@nestjs/common";
import { TransactionContext } from "../../../database/transaction-context.js";

/**
 * Boutique en examen, ouverte ou suspendue : elle doit d'abord être fermée par l'équipe (commandes de clients en
 * cours, versements à venir ; une boutique suspendue peut encore avoir des commandes ouvertes — relecture S7-T08).
 */
const OPEN_SHOP = ["PENDING", "ACTIVE", "SUSPENDED"] as const;

/**
 * Données personnelles du module vendors (S7-T08, ADR-0047). Dans la transaction partagée (`TransactionContext`).
 */
@Injectable()
export class VendorsPersonalData {
  constructor(private readonly tx: TransactionContext) {}

  async blockers(accountId: string): Promise<string[]> {
    const open = await this.tx.db.shop.count({
      where: { ownerAccountId: accountId, status: { in: [...OPEN_SHOP] } },
    });
    return open > 0 ? ["BOUTIQUE_OUVERTE"] : [];
  }

  /** Boutique et dossier de vérification, SANS les pièces ni les numéros complets (chiffrés, jamais exportés). */
  async export(accountId: string): Promise<Record<string, unknown>> {
    const shop = await this.tx.db.shop.findUnique({
      where: { ownerAccountId: accountId },
      select: {
        name: true,
        status: true,
        statusReason: true,
        city: true,
        contactPhone: true,
        description: true,
        submittedAt: true,
        reviewedAt: true,
        kycFile: {
          select: {
            status: true,
            holderKind: true,
            legalName: true,
            idType: true,
            idNumberEnd: true,
            rccmNumber: true,
            payoutMethod: true,
            payoutAccountEnd: true,
            payoutHolder: true,
            submittedAt: true,
            reviewedAt: true,
            rejectionReason: true,
          },
        },
      },
    });
    return { boutique: shop };
  }

  /**
   * Boutique fermée gardée (elle figure dans des commandes passées) sans son téléphone de contact ; dossier de
   * vérification SUPPRIMÉ (pièces, nom légal, numéros chiffrés) : aucun versement ne dépend plus de lui.
   */
  async erase(accountId: string): Promise<void> {
    const db = this.tx.db;
    const shop = await db.shop.findUnique({
      where: { ownerAccountId: accountId },
      select: { id: true },
    });
    if (!shop) return;
    await db.kycDocument.deleteMany({ where: { shopId: shop.id } });
    await db.kycFile.deleteMany({ where: { shopId: shop.id } });
    await db.shop.update({ where: { id: shop.id }, data: { contactPhone: null } });
  }
}
