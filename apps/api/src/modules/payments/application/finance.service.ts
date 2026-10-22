import { Inject, Injectable } from "@nestjs/common";
import { AuditLog, type AuditContext } from "../../audit/index.js";
import { AccountDirectory } from "../../identity/index.js";
import { OrderPayments, type OrderRecord } from "../../orders/index.js";
import { MAX_EMAIL_ATTEMPTS, type InvoiceRecord } from "../domain/invoice.js";
import { PaymentsError } from "../domain/payments-error.js";
import {
  INVOICE_MAILER,
  INVOICE_RENDERER,
  INVOICE_REPOSITORY,
  type InvoiceMailer,
  type InvoiceRenderer,
  type InvoiceRepository,
} from "./ports.js";

/** Factures listées par page. */
export const ADMIN_INVOICE_PAGE = 30;
/** Une même facture n'est renvoyée qu'une fois par période (évite d'inonder le client par erreur). */
export const RESEND_COOLDOWN_MS = 10 * 60_000;

export type InvoiceEmailState = "sent" | "pending" | "failed";

export function emailStateOf(
  invoice: Pick<InvoiceRecord, "emailSentAt" | "emailAttempts">,
): InvoiceEmailState {
  if (invoice.emailSentAt) return "sent";
  return invoice.emailAttempts >= MAX_EMAIL_ATTEMPTS ? "failed" : "pending";
}

const notFound = () => new PaymentsError("FACTURE_INTROUVABLE", "facture introuvable");

/**
 * Écrans de la Finance (S7.5-T05, ADR-0052) : factures et avoirs de toutes les commandes, PDF, renvoi au client, et
 * espèces à encaisser. Les routes exigent le rôle « finance » et la double authentification ; un téléchargement et un
 * renvoi sont inscrits au journal d'audit (données personnelles du client sur le PDF).
 *
 * Une facture est figée par la base (obligation légale), y compris le suivi de son envoi automatique : un renvoi part
 * donc tout de suite, à part, sans toucher à ce suivi.
 */
@Injectable()
export class FinanceService {
  /** Horloge (remplaçable dans les tests). */
  clock: () => Date = () => new Date();
  /** Dernier renvoi par facture (une seule instance de l'API au MVP). */
  private readonly lastResent = new Map<string, number>();

  constructor(
    private readonly orders: OrderPayments,
    private readonly directory: AccountDirectory,
    @Inject(INVOICE_REPOSITORY) private readonly invoices: InvoiceRepository,
    @Inject(INVOICE_RENDERER) private readonly renderer: InvoiceRenderer,
    @Inject(INVOICE_MAILER) private readonly mailer: InvoiceMailer,
    @Inject(AuditLog) private readonly audit: Pick<AuditLog, "record">,
  ) {}

  /** `query` : numéro de facture ou d'avoir, ou numéro de commande (déjà vérifié par le contrat). */
  page(query: string | undefined, after?: { issuedAt: Date; id: string }) {
    const invoiceNumber =
      query?.startsWith("KMD-F-") || query?.startsWith("KMD-A-") ? query : undefined;
    const orderReference = query && !invoiceNumber ? query : undefined;
    return this.invoices.page({ invoiceNumber, orderReference, after, limit: ADMIN_INVOICE_PAGE });
  }

  async pdf(
    actorId: string,
    number: string,
    context: AuditContext,
  ): Promise<{ invoice: InvoiceRecord; pdf: Uint8Array }> {
    const invoice = await this.invoices.findByNumber(number);
    if (!invoice) throw notFound();
    const pdf = await this.renderer.render(invoice);
    await this.audit.record({
      action: "invoice.downloaded",
      actor: { type: "account", id: actorId },
      target: { type: "order", id: invoice.orderId },
      details: { number: invoice.number },
      context,
    });
    return { invoice, pdf };
  }

  /**
   * Renvoie la facture au client, tout de suite, à son e-mail vérifié. Refusé pendant que l'envoi automatique est
   * encore en cours (il partirait deux fois), sans adresse vérifiée, sans envoi configuré, ou dans les 10 minutes
   * qui suivent un renvoi.
   */
  async resend(actorId: string, number: string, context: AuditContext): Promise<InvoiceRecord> {
    const invoice = await this.invoices.findByNumber(number);
    if (!invoice) throw notFound();
    if (emailStateOf(invoice) === "pending") {
      throw new PaymentsError(
        "ENVOI_IMPOSSIBLE",
        "l'envoi automatique de cette facture est encore en cours : réessayez plus tard",
      );
    }
    if (!this.mailer.available) {
      throw new PaymentsError(
        "ENVOI_IMPOSSIBLE",
        "aucun envoi d'e-mail n'est configuré sur le serveur",
      );
    }
    const now = this.clock().getTime();
    const last = this.lastResent.get(invoice.id);
    if (last !== undefined && now - last < RESEND_COOLDOWN_MS) {
      throw new PaymentsError(
        "ENVOI_IMPOSSIBLE",
        "cette facture vient d'être renvoyée : patientez 10 minutes avant de recommencer",
      );
    }
    const contact = await this.directory.contactOf(invoice.accountId);
    if (!contact?.email) {
      throw new PaymentsError("ENVOI_IMPOSSIBLE", "le client n'a pas d'adresse e-mail vérifiée");
    }
    this.lastResent.set(invoice.id, now);
    try {
      await this.mailer.send(
        contact.email,
        invoice,
        contact.firstName,
        await this.renderer.render(invoice),
      );
    } catch {
      this.lastResent.delete(invoice.id);
      throw new PaymentsError(
        "ENVOI_IMPOSSIBLE",
        "l'e-mail n'a pas pu partir : réessayez dans un instant",
      );
    }
    await this.audit.record({
      action: "invoice.resent",
      actor: { type: "account", id: actorId },
      target: { type: "order", id: invoice.orderId },
      details: { number: invoice.number },
      context,
    });
    return invoice;
  }

  /** Commandes payées en espèces à la livraison, expédiées ou livrées, pas encore encaissées. */
  cashToCollect(): Promise<OrderRecord[]> {
    return this.orders.listCashToCollect();
  }
}
