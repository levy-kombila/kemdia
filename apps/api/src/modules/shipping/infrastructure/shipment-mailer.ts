import type { MailTransport } from "../../../mail/mail-transport.js";
import type { ShipmentEmailKind, ShipmentMailer, ShipmentNotice } from "../application/ports.js";

const escape = (s: string) =>
  s.replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!,
  );

/** Texte saisi par une personne (prénom) : sans caractère de contrôle ni retour à la ligne. */
const clean = (s: string, max: number) =>
  s
    .replace(/[\p{Cc}\p{Cf}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);

/**
 * E-mails de livraison au client (S7-T02). Même transport que les factures (`EMAIL_TRANSPORT`, ADR-0016) : aucune
 * nouvelle variable. Ils disent seulement la commande et la ville — jamais le motif d'un échec ni l'adresse.
 */
export class MailShipmentMailer implements ShipmentMailer {
  readonly available: boolean;

  constructor(private readonly transport: MailTransport | null) {
    this.available = transport !== null;
  }

  async send(to: string, kind: ShipmentEmailKind, notice: ShipmentNotice): Promise<void> {
    if (!this.transport) throw new Error("aucun envoi d'e-mail configuré");
    const name = clean(notice.firstName, 60) || "Bonjour";
    const follow = "Suivez-la dans votre compte Kemdia : Mon compte, puis Mes commandes.";
    const { subject, paragraphs } =
      kind === "handed_over"
        ? {
            subject: `Votre commande ${notice.reference} est en route`,
            paragraphs: [
              `${name},`,
              `Bonne nouvelle : votre commande ${notice.reference} a été remise à notre livreur. Elle est en route vers ${notice.cityName}.`,
              "Le livreur vous appellera avant de passer : gardez votre téléphone près de vous.",
              follow,
              "L'équipe Kemdia",
            ],
          }
        : {
            subject: `Votre commande ${notice.reference} a été livrée`,
            paragraphs: [
              `${name},`,
              `Votre commande ${notice.reference} a été livrée. Merci pour votre confiance !`,
              "Un souci avec un article ? Contactez le service client Kemdia.",
              "L'équipe Kemdia",
            ],
          };
    await this.transport.send({
      to,
      subject,
      text: paragraphs.join("\n\n"),
      html: paragraphs.map((p) => `<p>${escape(p)}</p>`).join(""),
      tag: "kemdia-livraisons",
    });
  }
}
