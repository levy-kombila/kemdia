import { Inject, Injectable, Logger } from "@nestjs/common";
import { AccountDirectory } from "../../identity/index.js";
import { OrderPayments, type OrderRecord } from "../../orders/index.js";
import {
  assertInvoiceAmounts,
  emailRetryDelayMs,
  formatInvoiceNumber,
  invoiceYear,
  MAX_EMAIL_ATTEMPTS,
  type InvoiceRecord,
} from "../domain/invoice.js";
import type { PaymentAttempt } from "../domain/payment.js";
import { PaymentsError } from "../domain/payments-error.js";
import {
  BILLING_SETTINGS_REPOSITORY,
  INVOICE_MAILER,
  INVOICE_POLICY,
  INVOICE_RENDERER,
  INVOICE_REPOSITORY,
  type BillingSettingsRepository,
  type InvoiceMailer,
  type InvoicePolicy,
  PAYMENT_REPOSITORY,
  type PaymentRepository,
  type InvoiceRenderer,
  type InvoiceRepository,
} from "./ports.js";

/**
 * Factures et avoirs (S5-T06, ADR-0028 ; FR-015).
 *
 * - `issueForPayment` : au paiement reçu, dans la transaction qui confirme la commande (ou note l'encaissement) ;
 * - `issueCreditNote` : à l'annulation d'une commande facturée, dans la transaction de l'annulation ;
 * - numéro tiré du compteur de l'année, verrouillé jusqu'à la fin de la transaction : aucun trou ;
 * - tout est copié et figé (entreprise, client, lignes, montants) ; le PDF est refait à l'identique à la demande ;
 * - l'e-mail part APRÈS la transaction (tâche planifiée, 5 essais) : un e-mail lent ne bloque jamais un paiement.
 */
@Injectable()
export class InvoiceService {
  private readonly logger = new Logger("Factures");
  clock: () => Date = () => new Date();

  constructor(
    private readonly orders: OrderPayments,
    private readonly directory: AccountDirectory,
    @Inject(INVOICE_REPOSITORY) private readonly invoices: InvoiceRepository,
    @Inject(BILLING_SETTINGS_REPOSITORY) private readonly settings: BillingSettingsRepository,
    @Inject(INVOICE_RENDERER) private readonly renderer: InvoiceRenderer,
    @Inject(INVOICE_MAILER) private readonly mailer: InvoiceMailer,
    @Inject(INVOICE_POLICY) private readonly policy: InvoicePolicy,
    @Inject(PAYMENT_REPOSITORY) private readonly payments: PaymentRepository,
  ) {}

  /**
   * Facture de la commande payée (à appeler dans la transaction du paiement). Déjà établie : rendue telle quelle.
   * `null` : en préproduction et en production, l'entreprise n'est pas encore renseignée (relecture de sécurité du
   * S5-T06 : une facture figée avec « NIF à compléter » ne se corrige plus) ; la facture sera établie par le rattrapage
   * dès que l'administrateur l'aura fait. Ne lève jamais pour cette raison : le paiement passe.
   */
  async issueForPayment(
    order: OrderRecord,
    payment: PaymentAttempt,
    now: Date,
  ): Promise<InvoiceRecord | null> {
    const existing = (await this.invoices.findByOrder(order.id)).find((i) => i.kind === "invoice");
    if (existing) return existing;
    const seller = await this.settings.get();
    if (this.policy.requireCompleteSettings && seller.updatedAt === null) {
      this.logger.warn(
        "facture en attente : informations de l'entreprise à renseigner (/admin/settings/billing)",
      );
      return null;
    }
    const lines = order.lines.map((l) => ({
      title: l.title,
      variantName: l.variantName,
      quantity: l.quantity,
      unitPrice: l.unitPrice,
      lineTotal: l.lineTotal,
    }));
    const amounts = {
      subtotal: order.subtotal,
      discount: order.discount,
      deliveryFee: order.deliveryFee,
      total: order.total,
    };
    assertInvoiceAmounts({ ...amounts, lines });
    const year = invoiceYear(now);
    const number = formatInvoiceNumber(
      "invoice",
      year,
      await this.invoices.nextSequence("invoice", year),
    );
    const d = order.delivery;
    return this.invoices.insert({
      number,
      kind: "invoice",
      orderId: order.id,
      orderReference: order.reference,
      accountId: order.accountId,
      creditedInvoiceId: null,
      issuedAt: now,
      ...amounts,
      vatMention: seller.vatMention,
      seller: {
        legalName: seller.legalName,
        address: seller.address,
        city: seller.city,
        phone: seller.phone,
        email: seller.email,
        taxId: seller.taxId,
        tradeRegister: seller.tradeRegister,
      },
      buyer: {
        name: d.fullName,
        phone: d.phone,
        address: `${d.neighborhood} — ${d.landmark}, ${d.cityName}`,
      },
      lines,
      paymentMethod: payment.method,
      paymentReference: payment.providerRef,
    });
  }

  /**
   * Avoir de la facture d'une commande annulée (à appeler dans la transaction de l'annulation) ; `null` si la commande
   * n'était pas facturée. Déjà établi : rendu tel quel. Il reprend la facture à l'identique, avec son propre numéro.
   */
  async issueCreditNote(order: OrderRecord, now: Date): Promise<InvoiceRecord | null> {
    const documents = await this.invoices.findByOrder(order.id);
    const invoice = documents.find((i) => i.kind === "invoice");
    if (!invoice) return null;
    const existing = documents.find((i) => i.kind === "credit_note");
    if (existing) return existing;
    const year = invoiceYear(now);
    const number = formatInvoiceNumber(
      "credit_note",
      year,
      await this.invoices.nextSequence("credit_note", year),
    );
    return this.invoices.insert({
      number,
      kind: "credit_note",
      orderId: invoice.orderId,
      orderReference: invoice.orderReference,
      accountId: invoice.accountId,
      creditedInvoiceId: invoice.id,
      issuedAt: now,
      subtotal: invoice.subtotal,
      discount: invoice.discount,
      deliveryFee: invoice.deliveryFee,
      total: invoice.total,
      vatMention: invoice.vatMention,
      seller: invoice.seller,
      buyer: invoice.buyer,
      lines: invoice.lines,
      paymentMethod: invoice.paymentMethod,
      paymentReference: invoice.paymentReference,
    });
  }

  /** Facture et avoir d'une commande du compte (sinon `COMMANDE_INTROUVABLE`). */
  async listForAccount(accountId: string, reference: string): Promise<InvoiceRecord[]> {
    const order = await this.orders.findForAccount(accountId, reference);
    return this.invoices.findByOrder(order.id);
  }

  /** PDF d'une facture ou d'un avoir d'une commande du compte. */
  async pdfForAccount(
    accountId: string,
    reference: string,
    number: string,
  ): Promise<{ invoice: InvoiceRecord; pdf: Uint8Array }> {
    const invoice = (await this.listForAccount(accountId, reference)).find(
      (i) => i.number === number,
    );
    if (!invoice) throw new PaymentsError("FACTURE_INTROUVABLE", "facture introuvable");
    return { invoice, pdf: await this.renderer.render(invoice) };
  }

  /**
   * Rattrapage (tâche planifiée) : commandes payées, non annulées, sans facture — par exemple payées avant que
   * l'entreprise soit renseignée. Chaque commande dans sa propre transaction, verrouillée. Renvoie le nombre établi.
   */
  async issueMissingInvoices(limit = 20): Promise<number> {
    let count = 0;
    for (const orderId of await this.invoices.findPaidOrdersWithoutInvoice(limit)) {
      try {
        const issued = await this.orders.transaction(async () => {
          const order = await this.orders.lockById(orderId);
          if (!order || order.paidAt === null || order.status === "cancelled") return false;
          const paid = (await this.payments.listForOrder(order.id)).find(
            (p) => p.status === "succeeded" && p.amount === order.total,
          );
          if (!paid) return false;
          return (await this.issueForPayment(order, paid, this.clock())) !== null;
        });
        if (issued) count++;
      } catch (error) {
        this.logger.warn(
          `rattrapage impossible : ${error instanceof Error ? error.name : "erreur inconnue"}`,
        );
      }
    }
    return count;
  }

  /**
   * Envoie par e-mail les factures et avoirs dont c'est l'heure (tâche planifiée). Chaque envoi est d'abord RÉSERVÉ
   * (un essai de plus, prochain essai repoussé) : deux instances n'envoient pas la même facture, et une panne de
   * l'envoi ne fait que repousser l'essai (1 min, 10 min, 1 h, 6 h ; 5 au plus). Sans adresse e-mail vérifiée : on
   * abandonne (le client télécharge sa facture). Renvoie le nombre envoyé.
   */
  async sendPendingEmails(limit = 20): Promise<number> {
    if (!this.mailer.available) return 0;
    let sent = 0;
    const now = this.clock();
    for (const id of await this.invoices.findDueEmails(now, limit)) {
      const invoice = await this.invoices.findById(id);
      if (!invoice || invoice.emailSentAt) continue;
      const contact = await this.directory.contactOf(invoice.accountId);
      if (!contact?.email) {
        await this.invoices.giveUpEmail(id);
        this.logger.warn(`${invoice.number} : pas d'adresse e-mail vérifiée, envoi abandonné`);
        continue;
      }
      const nextAt = new Date(now.getTime() + emailRetryDelayMs(invoice.emailAttempts + 1));
      if (!(await this.invoices.claimEmail(id, now, nextAt))) continue;
      let delivered = false;
      try {
        await this.mailer.send(
          contact.email,
          invoice,
          contact.firstName,
          await this.renderer.render(invoice),
        );
        delivered = true;
      } catch (error) {
        const last = invoice.emailAttempts + 1 >= MAX_EMAIL_ATTEMPTS;
        this.logger.warn(
          `envoi de ${invoice.number} impossible${last ? " — abandonné après 5 essais" : ""} : ${
            error instanceof Error ? error.message : "erreur inconnue"
          }`,
        );
      }
      // Hors du bloc précédent : un e-mail parti n'est jamais compté comme un échec
      if (delivered) {
        await this.invoices.markEmailSent(id, this.clock());
        sent++;
      }
    }
    return sent;
  }
}
