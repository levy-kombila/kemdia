import { Inject, Injectable } from "@nestjs/common";
import { AuditLog, type AuditContext } from "../../audit/index.js";
import { OrderPayments, OrdersError, type OrderRecord } from "../../orders/index.js";
import type { PaymentAttempt } from "../domain/payment.js";
import { PaymentsError } from "../domain/payments-error.js";
import { InvoiceService } from "./invoice.service.js";
import {
  PAYMENT_REPOSITORY,
  REFUND_REPOSITORY,
  type PaymentRepository,
  type RefundRecord,
  type RefundRepository,
} from "./ports.js";

/** Remboursements listés au plus (les plus anciens d'abord : ceux qui attendent depuis le plus longtemps). */
export const REFUND_LIST_MAX = 200;

/**
 * Service client (S5-T04, ADR-0026) : annuler une commande (même payée), suivre les remboursements à la main en
 * attendant l'API de l'opérateur, noter l'encaissement d'un paiement à la livraison (en attendant le livreur, S7).
 * Réservé aux administrateurs ; chaque action au journal d'audit, dans la même transaction.
 */
@Injectable()
export class PaymentAdminService {
  /** Horloge (remplaçable dans les tests). */
  clock: () => Date = () => new Date();

  constructor(
    private readonly orders: OrderPayments,
    @Inject(PAYMENT_REPOSITORY) private readonly payments: PaymentRepository,
    @Inject(REFUND_REPOSITORY) private readonly refunds: RefundRepository,
    @Inject(AuditLog) private readonly audit: Pick<AuditLog, "record">,
    private readonly invoices: InvoiceService,
  ) {}

  /**
   * Annule une commande pas encore expédiée : stock remis en vente, coupon rendu, essais en attente expirés, et un
   * remboursement « à faire » pour chaque paiement Mobile Money reçu. Une commande déjà annulée est renvoyée telle quelle.
   * Une commande encaissée en espèces ne s'annule pas ici (l'argent est entre les mains du livreur ou du client).
   */
  async cancelOrder(
    adminId: string,
    reference: string,
    note: string,
    context: AuditContext,
  ): Promise<{ order: OrderRecord; refunds: RefundRecord[] }> {
    return this.orders.transaction(async () => {
      const order = await this.orders.lockForAdmin(reference);
      if (order.status === "cancelled") return { order, refunds: [] };
      const attempts = await this.payments.listForOrder(order.id);
      if (attempts.some((a) => a.method === "cod" && a.status === "succeeded")) {
        throw new OrdersError(
          "ANNULATION_IMPOSSIBLE",
          "cette commande est déjà encaissée en espèces : elle ne peut plus être annulée ici",
        );
      }
      const now = this.clock();
      const { order: cancelled } = await this.orders.cancelByAdmin(order, now);
      for (const attempt of attempts.filter((a) => a.status === "pending")) {
        await this.payments.complete(attempt.id, "expired", now, "commande_annulee");
      }
      const refunds: RefundRecord[] = [];
      for (const paid of attempts.filter((a) => a.status === "succeeded" && a.method !== "cod")) {
        const refund = await this.refunds.createFor(paid, order.reference, "annulation_admin", now);
        if (refund) refunds.push(refund);
      }
      // Commande facturée : avoir du même montant (S5-T06 ; la facture, elle, ne change jamais). En dernier : le
      // compteur des avoirs reste verrouillé le moins longtemps possible
      await this.invoices.issueCreditNote(order, now);
      await this.audit.record({
        action: "order.cancelled_by_admin",
        actor: { type: "account", id: adminId },
        target: { type: "order", id: order.id },
        details: {
          reference: order.reference,
          previousStatus: order.status,
          refunds: refunds.length,
          // Texte libre : sans caractères de contrôle ni invisibles (journal lisible), 100 caractères au plus
          note: note
            .replace(/[\p{Cc}\p{Cf}]+/gu, " ")
            .trim()
            .slice(0, 100),
        },
        context,
      });
      return { order: cancelled, refunds };
    });
  }

  listRefunds(status: "to_do" | "done"): Promise<RefundRecord[]> {
    return this.refunds.list(status, REFUND_LIST_MAX);
  }

  /** Note un remboursement fait (référence de l'opération chez l'opérateur). Même référence renvoyée : rien ne change. */
  async markRefundDone(
    adminId: string,
    refundId: string,
    externalReference: string,
    context: AuditContext,
  ): Promise<RefundRecord> {
    return this.orders.transaction(async () => {
      const refund = await this.refunds.lock(refundId);
      if (!refund)
        throw new PaymentsError("REMBOURSEMENT_INTROUVABLE", "remboursement introuvable");
      if (refund.status === "done") {
        if (refund.externalReference === externalReference) return refund;
        throw new PaymentsError(
          "REMBOURSEMENT_DEJA_FAIT",
          "ce remboursement est déjà noté fait, avec une autre référence",
        );
      }
      // Une opération de l'opérateur ne rembourse qu'un seul remboursement
      if (await this.refunds.findByExternalReference(externalReference)) {
        throw new PaymentsError(
          "REMBOURSEMENT_DEJA_FAIT",
          "cette référence de l'opérateur est déjà notée pour un autre remboursement",
        );
      }
      const done = await this.refunds.markDone(refundId, externalReference, adminId, this.clock());
      await this.audit.record({
        action: "refund.done",
        actor: { type: "account", id: adminId },
        target: { type: "refund", id: refund.id },
        details: {
          reference: refund.orderReference,
          amount: refund.amount,
          externalReference,
        },
        context,
      });
      return done;
    });
  }

  /**
   * Paiement à la livraison encaissé : le montant doit être exactement le total. Déjà noté : l'encaissement existant est
   * renvoyé (`created: false`).
   */
  async codCollected(
    adminId: string,
    reference: string,
    amount: number,
    context: AuditContext,
  ): Promise<{ payment: PaymentAttempt; order: OrderRecord; created: boolean }> {
    return this.orders.transaction(async () => {
      const order = await this.orders.lockForAdmin(reference);
      if (order.paymentMethod !== "cod") {
        throw new PaymentsError(
          "ENCAISSEMENT_IMPOSSIBLE",
          "cette commande ne se paie pas à la livraison",
        );
      }
      const existing = (await this.payments.listForOrder(order.id)).find((p) => p.method === "cod");
      if (existing) return { payment: existing, order, created: false };
      if (order.status === "cancelled") {
        throw new PaymentsError("ENCAISSEMENT_IMPOSSIBLE", "cette commande est annulée");
      }
      if (amount !== order.total) {
        throw new PaymentsError(
          "ENCAISSEMENT_IMPOSSIBLE",
          `montant différent du total de la commande (${order.total} FCFA)`,
        );
      }
      const now = this.clock();
      // Commande notée payée : le client ne peut plus l'annuler en ligne
      await this.orders.recordCashCollected(order, now);
      const payment = await this.payments.insert(
        {
          orderId: order.id,
          accountId: order.accountId,
          method: "cod",
          amount,
          phone: null,
          status: "succeeded",
          attempt: 1,
          provider: "especes",
          collectedBy: adminId,
          expiresAt: null,
          completedAt: now,
        },
        now,
      );
      // Facture établie à l'encaissement (S5-T06, FR-015)
      await this.invoices.issueForPayment(order, payment, now);
      await this.audit.record({
        action: "cod.collected",
        actor: { type: "account", id: adminId },
        target: { type: "order", id: order.id },
        details: { reference: order.reference, amount },
        context,
      });
      return { payment, order, created: true };
    });
  }
}
