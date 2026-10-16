import type { MailTransport } from "../../../mail/mail-transport.js";
import type { InvoiceMailer } from "../application/ports.js";
import type { InvoiceRecord } from "../domain/invoice.js";
import { amount } from "./invoice-pdf.js";

const escape = (s: string) =>
  s.replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!,
  );

/** Prénom réduit à des caractères sûrs pour l'en-tête du message (aucun retour à la ligne). */
const cleanName = (s: string) =>
  s
    .replace(/[\p{Cc}\p{Cf}]/gu, "")
    .trim()
    .slice(0, 60);

/**
 * Facture ou avoir envoyé par e-mail, PDF joint (S5-T06). Même transport que les codes d'identité
 * (`EMAIL_TRANSPORT`, ADR-0016) : aucune nouvelle variable d'environnement.
 */
export class MailInvoiceMailer implements InvoiceMailer {
  readonly available: boolean;

  constructor(private readonly transport: MailTransport | null) {
    this.available = transport !== null;
  }

  async send(
    to: string,
    invoice: InvoiceRecord,
    firstName: string,
    pdf: Uint8Array,
  ): Promise<void> {
    if (!this.transport) throw new Error("aucun envoi d'e-mail configuré");
    const credit = invoice.kind === "credit_note";
    const name = cleanName(firstName) || "Bonjour";
    const doc = credit ? "votre avoir" : "votre facture";
    const subject = `${credit ? "Avoir" : "Facture"} ${invoice.number} — commande ${invoice.orderReference}`;
    const intro = credit
      ? `Votre commande ${invoice.orderReference} a été annulée. Voici ${doc} ${invoice.number} de ${amount(invoice.total)}${
          invoice.creditedNumber ? `, qui annule la facture ${invoice.creditedNumber}` : ""
        }.`
      : `Merci pour votre achat. Voici ${doc} ${invoice.number} pour la commande ${invoice.orderReference}, d'un montant de ${amount(invoice.total)}.`;
    const text = [
      `${name},`,
      "",
      intro,
      "Le document est en pièce jointe (PDF). Vous pouvez aussi le télécharger depuis votre commande.",
      "",
      "L'équipe Kemdia",
    ].join("\n");
    // Paragraphes échappés un par un (aucun texte du client n'entre tel quel dans le HTML)
    const html = [
      `${escape(name)},`,
      escape(intro),
      "Le document est en pièce jointe (PDF). Vous pouvez aussi le télécharger depuis votre commande.",
      "L'équipe Kemdia",
    ]
      .map((paragraph) => "<p>" + paragraph + "</p>")
      .join("");
    await this.transport.send({
      to,
      subject,
      text,
      html,
      tag: "kemdia-factures",
      attachments: [
        { filename: `${invoice.number}.pdf`, contentType: "application/pdf", content: pdf },
      ],
    });
  }
}
