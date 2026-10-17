import type { MailTransport } from "../../../mail/mail-transport.js";
import type { NewOrderNotice, VendorOrderMailer } from "../application/ports.js";

const escape = (s: string) =>
  s.replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!,
  );

/** Texte d'un champ saisi par une personne (prénom, nom de boutique) : sans caractère de contrôle ni retour à la ligne. */
const clean = (s: string, max: number) =>
  s
    .replace(/[\p{Cc}\p{Cf}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);

const money = (amount: number) => `${new Intl.NumberFormat("fr-FR").format(amount)} FCFA`;

/** Date et heure de Libreville (l'heure du vendeur), ex. « 18 octobre 2026 à 14:05 ». */
export const librevilleTime = (date: Date) =>
  new Intl.DateTimeFormat("fr-FR", {
    timeZone: "Africa/Libreville",
    dateStyle: "long",
    timeStyle: "short",
  }).format(date);

/**
 * E-mail « nouvelle commande » au vendeur (S6-T07). Même transport que les factures et les codes d'identité
 * (`EMAIL_TRANSPORT`, ADR-0016) : aucune nouvelle variable. Il dit seulement : la commande, le nombre d'articles, le
 * montant pour la boutique et l'échéance — aucune donnée du client.
 */
export class MailVendorOrderMailer implements VendorOrderMailer {
  readonly available: boolean;

  constructor(private readonly transport: MailTransport | null) {
    this.available = transport !== null;
  }

  async send(to: string, notice: NewOrderNotice): Promise<void> {
    if (!this.transport) throw new Error("aucun envoi d'e-mail configuré");
    const name = clean(notice.firstName, 60) || "Bonjour";
    const shop = clean(notice.shopName, 60);
    const due = librevilleTime(notice.dueAt);
    const articles = `${notice.itemCount} article${notice.itemCount > 1 ? "s" : ""}`;
    const paragraphs = [
      `${name},`,
      `Votre boutique « ${shop} » a reçu la commande ${notice.reference} : ${articles}, ${money(notice.subtotal)}.`,
      `Acceptez-la ou refusez-la avant le ${due} (heure de Libreville), dans votre espace vendeur Kemdia : Mon compte, puis Espace vendeur, puis Mes commandes.`,
      "Sans réponse à temps, la commande sera annulée pour le client.",
      "L'équipe Kemdia",
    ];
    await this.transport.send({
      to,
      subject: `Nouvelle commande ${notice.reference} — à accepter avant le ${due}`,
      text: paragraphs.join("\n\n"),
      // Paragraphes échappés un par un (le nom de la boutique est saisi par le vendeur)
      html: paragraphs.map((p) => `<p>${escape(p)}</p>`).join(""),
      tag: "kemdia-vendeurs",
    });
  }
}
