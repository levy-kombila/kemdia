import { Injectable } from "@nestjs/common";
import { TransactionContext } from "../../../database/transaction-context.js";

/**
 * Données personnelles du module payments (S7-T08, ADR-0047). Dans la transaction partagée (`TransactionContext`).
 * Les factures et avoirs sont des pièces comptables : leur copie figée (acheteur compris) est gardée 10 ans (droit
 * OHADA), même après l'effacement du compte.
 */
/** Délai pendant lequel un essai expiré ou échoué peut encore être confirmé par l'opérateur (prudence). */
const LATE_ANSWER_MS = 24 * 3_600_000;

@Injectable()
export class PaymentsPersonalData {
  constructor(private readonly tx: TransactionContext) {}

  /**
   * - Un remboursement encore à faire : il faut le numéro du client pour le payer.
   * - Un paiement Mobile Money sans réponse définitive (en attente, ou expiré / échoué depuis moins de 24 h) : une
   *   confirmation tardive de l'opérateur créerait un remboursement, qui a besoin du numéro (relecture S7-T08).
   */
  async blockers(accountId: string): Promise<string[]> {
    const db = this.tx.db;
    const codes: string[] = [];
    const toDo = await db.refund.count({ where: { status: "TO_DO", payment: { accountId } } });
    if (toDo > 0) codes.push("REMBOURSEMENT_EN_ATTENTE");
    const recent = new Date(Date.now() - LATE_ANSWER_MS);
    const waiting = await db.payment.count({
      where: {
        accountId,
        method: { not: "COD" },
        OR: [
          { status: "PENDING" },
          { status: { in: ["EXPIRED", "FAILED"] }, completedAt: { gt: recent } },
        ],
      },
    });
    if (waiting > 0) codes.push("PAIEMENT_EN_ATTENTE");
    return codes;
  }

  async export(accountId: string): Promise<Record<string, unknown>> {
    const db = this.tx.db;
    // L'une après l'autre : dans une transaction, une seule requête à la fois sur la connexion
    const payments = await db.payment.findMany({
      where: { accountId },
      orderBy: { createdAt: "desc" },
      select: {
        method: true,
        phone: true,
        amount: true,
        status: true,
        createdAt: true,
        completedAt: true,
        refund: {
          select: {
            orderReference: true,
            amount: true,
            phone: true,
            status: true,
            createdAt: true,
            doneAt: true,
          },
        },
      },
    });
    const invoices = await db.invoice.findMany({
      where: { accountId },
      orderBy: { issuedAt: "desc" },
      select: {
        number: true,
        kind: true,
        orderReference: true,
        issuedAt: true,
        total: true,
        buyer: true,
      },
    });
    return { paiements: payments, factures: invoices };
  }

  /** Numéros de téléphone des paiements et remboursements effacés ; factures gardées, plus aucun envoi en attente. */
  async erase(accountId: string, now: Date): Promise<void> {
    const db = this.tx.db;
    await db.payment.updateMany({
      where: { accountId, method: { not: "COD" }, anonymizedAt: null },
      data: { phone: null, anonymizedAt: now, updatedAt: now },
    });
    await db.refund.updateMany({
      where: { status: "DONE", anonymizedAt: null, payment: { accountId } },
      data: { phone: null, anonymizedAt: now, updatedAt: now },
    });
    await db.invoice.updateMany({
      where: { accountId, emailSentAt: null },
      data: { emailNextAt: null },
    });
  }
}
