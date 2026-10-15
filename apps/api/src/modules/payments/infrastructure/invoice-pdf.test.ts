import { PDFDocument } from "pdf-lib";
import { describe, expect, it } from "vitest";
import type { InvoiceRecord } from "../domain/invoice.js";
import { MailInvoiceMailer } from "./invoice-mailer.js";
import { amount, PdfInvoiceRenderer } from "./invoice-pdf.js";

export const SAMPLE: InvoiceRecord = {
  id: "i",
  number: "KMD-F-2026-000042",
  kind: "invoice",
  orderId: "o",
  orderReference: "KMD-7F3K9Q",
  accountId: "a",
  creditedInvoiceId: null,
  creditedNumber: null,
  issuedAt: new Date("2026-10-15T10:30:00Z"),
  subtotal: 134_000,
  discount: 13_400,
  deliveryFee: 2_000,
  total: 122_600,
  vatMention: "TVA non applicable",
  seller: {
    legalName: "Kemdia (raison sociale à compléter)",
    address: "Adresse à compléter",
    city: "Libreville",
    phone: "+241 00 00 00 00",
    email: "support@kemdia.ga",
    taxId: "NIF à compléter",
    tradeRegister: "RCCM à compléter",
  },
  buyer: {
    name: "Marie Nzé",
    phone: "+241077123456",
    address: "Glass — Portail bleu face à la pharmacie, Libreville",
  },
  lines: [
    {
      title: "Smartphone Tecno Spark 20 Pro",
      variantName: "128 Go — Noir",
      quantity: 1,
      unitPrice: 95_000,
      lineTotal: 95_000,
    },
    {
      title: "Pagne wax « Fleurs de mariage » 6 yards, coton imprimé de qualité supérieure",
      variantName: "",
      quantity: 3,
      unitPrice: 13_000,
      lineTotal: 39_000,
    },
  ],
  paymentMethod: "airtel",
  paymentReference: "SIM-1234",
  emailAttempts: 0,
  emailSentAt: null,
};

const renderer = new PdfInvoiceRenderer();

describe("Facture en PDF (S5-T06)", () => {
  it("un PDF valide, titré, daté de l'émission ; refait à l'identique", async () => {
    const bytes = await renderer.render(SAMPLE);
    const doc = await PDFDocument.load(bytes);
    expect(doc.getTitle()).toBe("Facture KMD-F-2026-000042");
    expect(doc.getCreationDate()?.toISOString()).toBe(SAMPLE.issuedAt.toISOString());
    expect(doc.getPageCount()).toBe(1);
    expect(Buffer.from(await renderer.render(SAMPLE)).equals(Buffer.from(bytes))).toBe(true);
  });

  it("caractères inconnus de la police (emoji, chinois, contrôle) : remplacés, jamais d'erreur", async () => {
    const odd = {
      ...SAMPLE,
      buyer: { ...SAMPLE.buyer, name: "Awa 😀 王 \u0007 Ndong", address: "Akanda — villa 3" },
    };
    await expect(renderer.render(odd)).resolves.toBeInstanceOf(Uint8Array);
  });

  it("beaucoup d'articles : plusieurs pages ; avoir : titré « Avoir »", async () => {
    const line = SAMPLE.lines[1]!;
    const many = {
      ...SAMPLE,
      kind: "credit_note" as const,
      number: "KMD-A-2026-000007",
      creditedNumber: "KMD-F-2026-000042",
      lines: Array.from({ length: 50 }, () => line),
      subtotal: 50 * line.lineTotal,
      discount: 0,
      total: 50 * line.lineTotal + SAMPLE.deliveryFee,
    };
    const doc = await PDFDocument.load(await renderer.render(many));
    expect(doc.getTitle()).toBe("Avoir KMD-A-2026-000007");
    expect(doc.getPageCount()).toBeGreaterThan(1);
  });

  it("texte sans espace très long : coupé, jamais hors de la page", async () => {
    const long = {
      ...SAMPLE,
      buyer: { ...SAMPLE.buyer, address: "x".repeat(200) },
      lines: [{ ...SAMPLE.lines[0]!, title: "y".repeat(600) }, SAMPLE.lines[1]!],
    };
    const doc = await PDFDocument.load(await renderer.render(long));
    expect(doc.getPageCount()).toBe(1);
  });

  it("montants : « 122 600 FCFA »", () => {
    expect(amount(122_600)).toBe("122 600 FCFA");
    expect(amount(1_000_000)).toBe("1 000 000 FCFA");
  });
});

describe("Facture par e-mail (S5-T06)", () => {
  it("PDF joint, sujet avec les numéros, prénom échappé dans le HTML", async () => {
    const sent: unknown[] = [];
    const mailer = new MailInvoiceMailer({
      name: "test",
      send: (email) => {
        sent.push(email);
        return Promise.resolve();
      },
    });
    await mailer.send("awa@exemple.ga", SAMPLE, "<b>Awa</b>\r\nBcc: x", new Uint8Array([37, 80]));
    expect(sent[0]).toMatchObject({
      to: "awa@exemple.ga",
      subject: "Facture KMD-F-2026-000042 — commande KMD-7F3K9Q",
      tag: "kemdia-factures",
      attachments: [{ filename: "KMD-F-2026-000042.pdf", contentType: "application/pdf" }],
    });
    const email = sent[0] as { html: string; text: string };
    expect(email.html).toContain("&lt;b&gt;Awa&lt;/b&gt;");
    expect(email.text).not.toContain("\r");
  });

  it("aucun envoi configuré : indisponible", async () => {
    const mailer = new MailInvoiceMailer(null);
    expect(mailer.available).toBe(false);
    await expect(mailer.send("a@b.ga", SAMPLE, "Awa", new Uint8Array())).rejects.toThrow();
  });
});
