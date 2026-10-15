import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import type { InvoiceRenderer } from "../application/ports.js";
import { invoiceDate, type InvoiceRecord } from "../domain/invoice.js";

/** Format A4 en points (1/72 de pouce). */
const PAGE = { width: 595.28, height: 841.89 };
const MARGIN = 48;
const INK = rgb(0.1, 0.1, 0.12);
const MUTED = rgb(0.42, 0.42, 0.46);
const BRAND = rgb(0.85, 0.11, 0.17);
const RULE = rgb(0.85, 0.85, 0.87);

const METHOD_LABEL = {
  airtel: "Airtel Money",
  moov: "Moov Money",
  cod: "Paiement à la livraison (espèces)",
};

/** 12500 → « 12 500 FCFA » (espaces simples : la police standard du PDF n'a pas l'espace fine). */
export function amount(n: number): string {
  return `${String(n).replace(/\B(?=(\d{3})+(?!\d))/g, " ")} FCFA`;
}

/**
 * Mise en page de la facture ou de l'avoir (S5-T06, ADR-0028) avec pdf-lib et la police standard Helvetica (aucun
 * fichier de police, aucun appel réseau). Le PDF est refait à l'identique à partir de la copie figée en base : date de
 * création = date d'émission. Les caractères que la police ne connaît pas sont remplacés (jamais d'erreur).
 */
export class PdfInvoiceRenderer implements InvoiceRenderer {
  async render(invoice: InvoiceRecord): Promise<Uint8Array> {
    const doc = await PDFDocument.create();
    const regular = await doc.embedFont(StandardFonts.Helvetica);
    const bold = await doc.embedFont(StandardFonts.HelveticaBold);
    const credit = invoice.kind === "credit_note";
    const title = `${credit ? "Avoir" : "Facture"} ${invoice.number}`;
    doc.setTitle(title);
    doc.setAuthor(invoice.seller.legalName.slice(0, 120));
    doc.setCreator("Kemdia");
    doc.setProducer("Kemdia");
    doc.setCreationDate(invoice.issuedAt);
    doc.setModificationDate(invoice.issuedAt);

    const cache = new Map<string, string>();
    const safe = (text: string, font: PDFFont): string =>
      [...text.normalize("NFC").replace(/[\u00a0\u202f\u2009]/g, " ")]
        .map((ch) => {
          const key = `${font.name}:${ch}`;
          let out = cache.get(key);
          if (out === undefined) {
            try {
              font.encodeText(ch);
              out = /[\p{Cc}\p{Cf}]/u.test(ch) ? " " : ch;
            } catch {
              out = "?";
            }
            cache.set(key, out);
          }
          return out;
        })
        .join("");

    let page: PDFPage = doc.addPage([PAGE.width, PAGE.height]);
    let y = PAGE.height - MARGIN;
    const text = (
      value: string,
      x: number,
      options: {
        size?: number;
        font?: PDFFont;
        color?: ReturnType<typeof rgb>;
        right?: boolean;
      } = {},
    ) => {
      const font = options.font ?? regular;
      const size = options.size ?? 10;
      const clean = safe(value, font);
      const width = font.widthOfTextAtSize(clean, size);
      page.drawText(clean, {
        x: options.right ? x - width : x,
        y,
        size,
        font,
        color: options.color ?? INK,
      });
    };
    /**
     * Découpe un texte pour qu'il tienne dans `width` ; un mot trop long est coupé lui aussi (relecture de sécurité :
     * rien ne sort de la page). Au plus `maxLines` lignes, la dernière terminée par « … ».
     */
    const wrap = (
      value: string,
      width: number,
      font: PDFFont,
      size: number,
      maxLines = 4,
    ): string[] => {
      const fits = (t: string) => font.widthOfTextAtSize(t, size) <= width;
      const pieces: string[] = [];
      for (const word of safe(value, font).split(/\s+/).filter(Boolean)) {
        let rest = word;
        while (!fits(rest)) {
          let cut = rest.length - 1;
          while (cut > 1 && !fits(rest.slice(0, cut))) cut--;
          pieces.push(rest.slice(0, cut));
          rest = rest.slice(cut);
        }
        pieces.push(rest);
      }
      const lines: string[] = [];
      let current = "";
      for (const piece of pieces) {
        const next = current ? `${current} ${piece}` : piece;
        if (fits(next) || !current) current = next;
        else {
          lines.push(current);
          current = piece;
        }
      }
      if (current) lines.push(current);
      if (lines.length > maxLines) {
        lines.length = maxLines;
        let last = lines[maxLines - 1]!;
        while (last.length > 1 && !fits(`${last}…`)) last = last.slice(0, -1);
        lines[maxLines - 1] = `${last}…`;
      }
      return lines.length ? lines : [""];
    };
    const newPageIfNeeded = (needed: number) => {
      if (y - needed > MARGIN + 40) return;
      page = doc.addPage([PAGE.width, PAGE.height]);
      y = PAGE.height - MARGIN;
    };

    // En-tête : vendeur à gauche, document à droite
    const s = invoice.seller;
    text(s.legalName, MARGIN, { size: 14, font: bold, color: BRAND });
    text(credit ? "AVOIR" : "FACTURE", PAGE.width - MARGIN, { size: 18, font: bold, right: true });
    y -= 16;
    for (const line of [
      s.address,
      s.city,
      `Tél. ${s.phone} — ${s.email}`,
      `NIF : ${s.taxId}`,
      `RCCM : ${s.tradeRegister}`,
    ]) {
      text(line, MARGIN, { size: 9, color: MUTED });
      y -= 12;
    }
    const sellerBottom = y;
    y += 12 * 5;
    const right = PAGE.width - MARGIN;
    const meta = [
      `N° ${invoice.number}`,
      `Date : ${invoiceDate(invoice.issuedAt)}`,
      `Commande : ${invoice.orderReference}`,
      ...(credit && invoice.creditedNumber ? [`Annule la facture ${invoice.creditedNumber}`] : []),
    ];
    for (const line of meta) {
      text(line, right, { size: 10, font: line.startsWith("N°") ? bold : regular, right: true });
      y -= 13;
    }
    // Le bloc le plus bas des deux, puis un espace
    y = Math.min(y, sellerBottom) - 14;

    // Client
    text("Facturé à", MARGIN, { size: 9, font: bold, color: MUTED });
    y -= 14;
    text(invoice.buyer.name, MARGIN, { font: bold });
    y -= 13;
    text(`Tél. ${invoice.buyer.phone}`, MARGIN, { size: 9 });
    y -= 12;
    for (const line of wrap(invoice.buyer.address, 300, regular, 9)) {
      text(line, MARGIN, { size: 9 });
      y -= 12;
    }
    y -= 14;

    // Tableau des articles
    const cols = { label: MARGIN, qty: 360, unit: 450, total: right };
    const header = () => {
      page.drawRectangle({
        x: MARGIN,
        y: y - 5,
        width: right - MARGIN,
        height: 18,
        color: rgb(0.96, 0.96, 0.97),
      });
      text("Article", cols.label + 4, { size: 9, font: bold });
      text("Qté", cols.qty, { size: 9, font: bold, right: true });
      text("Prix unitaire", cols.unit, { size: 9, font: bold, right: true });
      text("Total", cols.total - 4, { size: 9, font: bold, right: true });
      y -= 20;
    };
    header();
    for (const line of invoice.lines) {
      const label = line.variantName ? `${line.title} — ${line.variantName}` : line.title;
      const rows = wrap(label, cols.qty - cols.label - 40, regular, 9);
      newPageIfNeeded(rows.length * 12 + 8);
      if (y > PAGE.height - MARGIN - 1) header();
      text(String(line.quantity), cols.qty, { size: 9, right: true });
      text(amount(line.unitPrice), cols.unit, { size: 9, right: true });
      text(amount(line.lineTotal), cols.total - 4, { size: 9, right: true });
      for (const row of rows) {
        text(row, cols.label + 4, { size: 9 });
        y -= 12;
      }
      page.drawLine({
        start: { x: MARGIN, y: y + 4 },
        end: { x: right, y: y + 4 },
        thickness: 0.5,
        color: RULE,
      });
      y -= 4;
    }

    // Totaux
    newPageIfNeeded(110);
    y -= 8;
    const totals: [string, string, boolean][] = [
      ["Sous-total articles", amount(invoice.subtotal), false],
      ...(invoice.discount > 0
        ? [
            ["Réduction (coupon)", `- ${amount(invoice.discount)}`, false] as [
              string,
              string,
              boolean,
            ],
          ]
        : []),
      ["Livraison", invoice.deliveryFee > 0 ? amount(invoice.deliveryFee) : "Offerte", false],
      [credit ? "Montant de l'avoir" : "Total payé", amount(invoice.total), true],
    ];
    for (const [label, value, strong] of totals) {
      text(label, cols.unit, {
        size: strong ? 11 : 10,
        font: strong ? bold : regular,
        right: true,
      });
      text(value, cols.total - 4, {
        size: strong ? 11 : 10,
        font: strong ? bold : regular,
        right: true,
      });
      y -= strong ? 18 : 14;
    }
    y -= 6;
    text(invoice.vatMention, MARGIN, { size: 9, color: MUTED });
    y -= 12;
    const paid = `${credit ? "Paiement d'origine" : "Payé par"} : ${METHOD_LABEL[invoice.paymentMethod]}${
      invoice.paymentReference ? ` (réf. ${invoice.paymentReference})` : ""
    }`;
    for (const line of wrap(paid, right - MARGIN, regular, 9)) {
      text(line, MARGIN, { size: 9, color: MUTED });
      y -= 12;
    }
    text("Montants en francs CFA (XAF).", MARGIN, { size: 9, color: MUTED });

    // Pied de page : numéro et pagination
    const pages = doc.getPages();
    pages.forEach((p, i) => {
      const footer = safe(`${title} — page ${i + 1}/${pages.length}`, regular);
      p.drawText(footer, {
        x: PAGE.width - MARGIN - regular.widthOfTextAtSize(footer, 8),
        y: MARGIN / 2,
        size: 8,
        font: regular,
        color: MUTED,
      });
    });
    return doc.save({ useObjectStreams: true });
  }
}
