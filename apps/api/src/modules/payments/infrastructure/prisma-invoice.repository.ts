import { randomUUID } from "node:crypto";
import { Injectable } from "@nestjs/common";
import { TransactionContext } from "../../../database/transaction-context.js";
import type {
  $Enums,
  BillingSettings as BillingRow,
  Invoice as InvoiceRow,
} from "../../../generated/prisma/client.js";
import type {
  BillingSettingsRecord,
  BillingSettingsRepository,
  InvoiceRepository,
  NewInvoice,
} from "../application/ports.js";
import {
  MAX_EMAIL_ATTEMPTS,
  type InvoiceBuyer,
  type InvoiceKind,
  type InvoiceLine,
  type InvoiceRecord,
  type InvoiceSeller,
} from "../domain/invoice.js";

const KIND_TO_DB: Record<InvoiceKind, $Enums.DocumentKind> = {
  invoice: "INVOICE",
  credit_note: "CREDIT_NOTE",
};
const METHOD_FROM_DB: Record<$Enums.PaymentChannel, InvoiceRecord["paymentMethod"]> = {
  AIRTEL: "airtel",
  MOOV: "moov",
  COD: "cod",
};
const METHOD_TO_DB: Record<InvoiceRecord["paymentMethod"], $Enums.PaymentChannel> = {
  airtel: "AIRTEL",
  moov: "MOOV",
  cod: "COD",
};

function toRecord(row: InvoiceRow, creditedNumber: string | null): InvoiceRecord {
  return {
    id: row.id,
    number: row.number,
    kind: row.kind === "INVOICE" ? "invoice" : "credit_note",
    orderId: row.orderId,
    orderReference: row.orderReference,
    accountId: row.accountId,
    creditedInvoiceId: row.creditedInvoiceId,
    creditedNumber,
    issuedAt: row.issuedAt,
    subtotal: row.subtotal,
    discount: row.discount,
    deliveryFee: row.deliveryFee,
    total: row.total,
    vatMention: row.vatMention,
    seller: row.seller as unknown as InvoiceSeller,
    buyer: row.buyer as unknown as InvoiceBuyer,
    lines: row.lines as unknown as InvoiceLine[],
    paymentMethod: METHOD_FROM_DB[row.paymentMethod],
    paymentReference: row.paymentReference,
    emailAttempts: row.emailAttempts,
    emailSentAt: row.emailSentAt,
  };
}

/**
 * Factures et avoirs (schéma `payments`, S5-T06). Les écritures rejoignent la transaction en cours : la facture, son
 * numéro et le paiement qui la déclenche sont enregistrés ensemble, ou pas du tout (aucun numéro perdu).
 */
@Injectable()
export class PrismaInvoiceRepository implements InvoiceRepository {
  constructor(private readonly tx: TransactionContext) {}

  async nextSequence(kind: InvoiceKind, year: number): Promise<number> {
    const rows = await this.tx.db.$queryRaw<{ last_number: number }[]>`
      INSERT INTO "payments"."invoice_counters" ("kind", "year", "last_number")
      VALUES (${KIND_TO_DB[kind]}::"payments"."document_kind", ${year}, 1)
      ON CONFLICT ("kind", "year")
      DO UPDATE SET "last_number" = "payments"."invoice_counters"."last_number" + 1
      RETURNING "last_number"`;
    return rows[0]!.last_number;
  }

  async insert(invoice: NewInvoice): Promise<InvoiceRecord> {
    const row = await this.tx.db.invoice.create({
      data: {
        id: randomUUID(),
        number: invoice.number,
        kind: KIND_TO_DB[invoice.kind],
        orderId: invoice.orderId,
        orderReference: invoice.orderReference,
        accountId: invoice.accountId,
        creditedInvoiceId: invoice.creditedInvoiceId,
        issuedAt: invoice.issuedAt,
        subtotal: invoice.subtotal,
        discount: invoice.discount,
        deliveryFee: invoice.deliveryFee,
        total: invoice.total,
        vatMention: invoice.vatMention,
        seller: { ...invoice.seller },
        buyer: { ...invoice.buyer },
        lines: invoice.lines.map((l) => ({ ...l })),
        paymentMethod: METHOD_TO_DB[invoice.paymentMethod],
        paymentReference: invoice.paymentReference,
        createdAt: invoice.issuedAt,
      },
    });
    return this.withCredited(row);
  }

  async findByOrder(orderId: string): Promise<InvoiceRecord[]> {
    const rows = await this.tx.db.invoice.findMany({
      where: { orderId },
      orderBy: [{ issuedAt: "asc" }, { kind: "asc" }],
    });
    const numbers = new Map(rows.map((r) => [r.id, r.number]));
    return rows.map((r) =>
      toRecord(r, r.creditedInvoiceId ? (numbers.get(r.creditedInvoiceId) ?? null) : null),
    );
  }

  async findById(id: string): Promise<InvoiceRecord | null> {
    const row = await this.tx.db.invoice.findUnique({ where: { id } });
    return row ? this.withCredited(row) : null;
  }

  async findByNumber(number: string): Promise<InvoiceRecord | null> {
    const row = await this.tx.db.invoice.findUnique({ where: { number } });
    return row ? this.withCredited(row) : null;
  }

  async page(input: {
    invoiceNumber?: string;
    orderReference?: string;
    after?: { issuedAt: Date; id: string };
    limit: number;
  }): Promise<{ items: InvoiceRecord[]; next: { issuedAt: Date; id: string } | null }> {
    const after = input.after;
    const rows = await this.tx.db.invoice.findMany({
      where: {
        ...(input.invoiceNumber ? { number: input.invoiceNumber } : {}),
        ...(input.orderReference ? { orderReference: input.orderReference } : {}),
        ...(after
          ? {
              OR: [
                { issuedAt: { lt: after.issuedAt } },
                { issuedAt: after.issuedAt, id: { lt: after.id } },
              ],
            }
          : {}),
      },
      orderBy: [{ issuedAt: "desc" }, { id: "desc" }],
      take: input.limit + 1,
    });
    const items = rows.slice(0, input.limit);
    const credited = await this.tx.db.invoice.findMany({
      where: {
        id: { in: items.flatMap((r) => (r.creditedInvoiceId ? [r.creditedInvoiceId] : [])) },
      },
      select: { id: true, number: true },
    });
    const numbers = new Map(credited.map((r) => [r.id, r.number]));
    const last = items.at(-1);
    return {
      items: items.map((r) =>
        toRecord(r, r.creditedInvoiceId ? (numbers.get(r.creditedInvoiceId) ?? null) : null),
      ),
      next: rows.length > input.limit && last ? { issuedAt: last.issuedAt, id: last.id } : null,
    };
  }

  async findDueEmails(now: Date, limit: number): Promise<string[]> {
    const rows = await this.tx.db.invoice.findMany({
      where: {
        emailSentAt: null,
        emailAttempts: { lt: MAX_EMAIL_ATTEMPTS },
        OR: [{ emailNextAt: null }, { emailNextAt: { lte: now } }],
      },
      orderBy: { createdAt: "asc" },
      take: limit,
      select: { id: true },
    });
    return rows.map((r) => r.id);
  }

  async claimEmail(id: string, now: Date, nextAt: Date): Promise<boolean> {
    const claimed = await this.tx.db.$executeRaw`
      UPDATE "payments"."invoices"
      SET "email_attempts" = "email_attempts" + 1, "email_next_at" = ${nextAt}
      WHERE "id" = ${id}::uuid AND "email_sent_at" IS NULL AND "email_attempts" < ${MAX_EMAIL_ATTEMPTS}
        AND ("email_next_at" IS NULL OR "email_next_at" <= ${now})`;
    return claimed === 1;
  }

  async markEmailSent(id: string, now: Date): Promise<void> {
    await this.tx.db.invoice.updateMany({
      where: { id, emailSentAt: null },
      data: { emailSentAt: now },
    });
  }

  async giveUpEmail(id: string): Promise<void> {
    await this.tx.db.invoice.updateMany({
      where: { id, emailSentAt: null },
      data: { emailAttempts: MAX_EMAIL_ATTEMPTS },
    });
  }

  async findPaidOrdersWithoutInvoice(limit: number): Promise<string[]> {
    const rows = await this.tx.db.$queryRaw<{ order_id: string }[]>`
      SELECT DISTINCT p."order_id" FROM "payments"."payments" p
      WHERE p."status" = 'SUCCEEDED'
        AND NOT EXISTS (SELECT 1 FROM "payments"."refunds" r WHERE r."payment_id" = p."id")
        AND NOT EXISTS (
          SELECT 1 FROM "payments"."invoices" i WHERE i."order_id" = p."order_id" AND i."kind" = 'INVOICE')
      LIMIT ${limit}`;
    return rows.map((r) => r.order_id);
  }

  private async withCredited(row: InvoiceRow): Promise<InvoiceRecord> {
    if (!row.creditedInvoiceId) return toRecord(row, null);
    const credited = await this.tx.db.invoice.findUnique({
      where: { id: row.creditedInvoiceId },
      select: { number: true },
    });
    return toRecord(row, credited?.number ?? null);
  }
}

function settingsOf(row: BillingRow): BillingSettingsRecord {
  return {
    legalName: row.legalName,
    address: row.address,
    city: row.city,
    phone: row.phone,
    email: row.email,
    taxId: row.taxId,
    tradeRegister: row.tradeRegister,
    vatMention: row.vatMention,
    updatedAt: row.updatedAt,
  };
}

/** Informations de l'entreprise (une ligne posée par la migration). */
@Injectable()
export class PrismaBillingSettingsRepository implements BillingSettingsRepository {
  constructor(private readonly tx: TransactionContext) {}

  async get(): Promise<BillingSettingsRecord> {
    return settingsOf(await this.tx.db.billingSettings.findUniqueOrThrow({ where: { id: 1 } }));
  }

  async save(
    settings: Omit<BillingSettingsRecord, "updatedAt">,
    adminId: string,
    now: Date,
  ): Promise<BillingSettingsRecord> {
    const data = { ...settings, updatedBy: adminId, updatedAt: now };
    return settingsOf(
      await this.tx.db.billingSettings.upsert({
        where: { id: 1 },
        create: { id: 1, ...data },
        update: data,
      }),
    );
  }
}
