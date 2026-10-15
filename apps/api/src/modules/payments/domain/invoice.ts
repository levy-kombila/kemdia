/**
 * Factures et avoirs (S5-T06, ADR-0028) — TypeScript pur.
 *
 * Une facture est établie quand le paiement est reçu (Mobile Money confirmé, ou espèces encaissées) ; un avoir du même
 * montant quand une commande facturée est annulée. Numéros par année, sans trou : « KMD-F-2026-000001 » (facture),
 * « KMD-A-2026-000001 » (avoir). Tout est copié et figé au moment de l'émission (entreprise, client, lignes, montants).
 */
export const INVOICE_KINDS = ["invoice", "credit_note"] as const;
export type InvoiceKind = (typeof INVOICE_KINDS)[number];

/** Gabon : heure d'Afrique de l'Ouest (UTC+1, sans heure d'été) — une facture du 31 décembre à 23 h 30 est de l'année en cours. */
const GABON_OFFSET_MS = 60 * 60_000;
export const MAX_SEQUENCE = 999_999;
/** Envois d'une facture par e-mail : 5 essais au plus, de plus en plus espacés (une panne d'une heure ne fait rien perdre). */
export const MAX_EMAIL_ATTEMPTS = 5;
const EMAIL_RETRY_MS = [60_000, 10 * 60_000, 60 * 60_000, 6 * 60 * 60_000];

/** Délai avant l'essai suivant, après l'essai n° `attempt` (1, 2…). */
export function emailRetryDelayMs(attempt: number): number {
  return EMAIL_RETRY_MS[Math.min(Math.max(attempt, 1), EMAIL_RETRY_MS.length) - 1]!;
}

export function invoiceYear(issuedAt: Date): number {
  return new Date(issuedAt.getTime() + GABON_OFFSET_MS).getUTCFullYear();
}

/** Date imprimée (jour/mois/année, heure du Gabon). */
export function invoiceDate(issuedAt: Date): string {
  const local = new Date(issuedAt.getTime() + GABON_OFFSET_MS);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(local.getUTCDate())}/${pad(local.getUTCMonth() + 1)}/${local.getUTCFullYear()}`;
}

export function formatInvoiceNumber(kind: InvoiceKind, year: number, sequence: number): string {
  if (!Number.isInteger(sequence) || sequence < 1 || sequence > MAX_SEQUENCE) {
    throw new RangeError("numéro de facture hors limites");
  }
  return `KMD-${kind === "invoice" ? "F" : "A"}-${year}-${String(sequence).padStart(6, "0")}`;
}

export interface InvoiceSeller {
  legalName: string;
  address: string;
  city: string;
  phone: string;
  email: string;
  taxId: string;
  tradeRegister: string;
}

export interface InvoiceBuyer {
  name: string;
  phone: string;
  /** Adresse de livraison, telle que saisie (quartier, repère, ville) */
  address: string;
}

export interface InvoiceLine {
  title: string;
  variantName: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
}

export interface InvoiceRecord {
  id: string;
  number: string;
  kind: InvoiceKind;
  orderId: string;
  orderReference: string;
  accountId: string;
  /** Avoir : numéro de la facture annulée */
  creditedInvoiceId: string | null;
  creditedNumber: string | null;
  issuedAt: Date;
  subtotal: number;
  discount: number;
  deliveryFee: number;
  total: number;
  vatMention: string;
  seller: InvoiceSeller;
  buyer: InvoiceBuyer;
  lines: InvoiceLine[];
  paymentMethod: "airtel" | "moov" | "cod";
  paymentReference: string | null;
  emailAttempts: number;
  emailSentAt: Date | null;
}

/** Montants d'une facture : mêmes règles que la commande (BR-004) — sinon, on n'émet rien. */
export function assertInvoiceAmounts(invoice: {
  subtotal: number;
  discount: number;
  deliveryFee: number;
  total: number;
  lines: readonly InvoiceLine[];
}): void {
  const sum = invoice.lines.reduce((n, l) => n + l.lineTotal, 0);
  const ok =
    invoice.lines.length > 0 &&
    invoice.lines.every((l) => l.quantity > 0 && l.lineTotal === l.unitPrice * l.quantity) &&
    sum === invoice.subtotal &&
    invoice.total === invoice.subtotal - invoice.discount + invoice.deliveryFee &&
    invoice.total > 0;
  if (!ok) throw new RangeError("montants de la facture incohérents");
}
