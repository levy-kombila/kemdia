import { randomUUID } from "node:crypto";
import { Injectable } from "@nestjs/common";
import { TransactionContext } from "../../../database/transaction-context.js";
import type {
  $Enums,
  Payment as PaymentRow,
  Refund as RefundRow,
} from "../../../generated/prisma/client.js";
import type {
  NewPayment,
  PaymentRepository,
  ProviderEventRepository,
  RefundReasonCode,
  RefundRecord,
  RefundRepository,
} from "../application/ports.js";
import {
  PROVIDER_DOWN,
  type PaymentAttempt,
  type PaymentChannel,
  type PaymentStatus,
} from "../domain/payment.js";

const STATUS_TO_DB: Record<PaymentStatus, $Enums.PaymentStatus> = {
  pending: "PENDING",
  succeeded: "SUCCEEDED",
  failed: "FAILED",
  expired: "EXPIRED",
};
const STATUS_FROM_DB = Object.fromEntries(
  Object.entries(STATUS_TO_DB).map(([k, v]) => [v, k]),
) as Record<$Enums.PaymentStatus, PaymentStatus>;
const CHANNEL_TO_DB: Record<PaymentChannel, $Enums.PaymentChannel> = {
  airtel: "AIRTEL",
  moov: "MOOV",
  cod: "COD",
};
const CHANNEL_FROM_DB = Object.fromEntries(
  Object.entries(CHANNEL_TO_DB).map(([k, v]) => [v, k]),
) as Record<$Enums.PaymentChannel, PaymentChannel>;
const REASON_TO_DB: Record<RefundReasonCode, $Enums.RefundReason> = {
  annulation_admin: "ADMIN_CANCEL",
  paiement_non_attendu: "UNEXPECTED_PAYMENT",
  annulation_vendeur: "VENDOR_CANCEL",
  annulation_livraison: "DELIVERY_CANCEL",
};
const REASON_FROM_DB = Object.fromEntries(
  Object.entries(REASON_TO_DB).map(([k, v]) => [v, k]),
) as Record<$Enums.RefundReason, RefundReasonCode>;

function toAttempt(row: PaymentRow): PaymentAttempt {
  return {
    id: row.id,
    orderId: row.orderId,
    accountId: row.accountId,
    method: CHANNEL_FROM_DB[row.method],
    amount: row.amount,
    phone: row.phone,
    status: STATUS_FROM_DB[row.status],
    attempt: row.attempt,
    provider: row.provider,
    providerRef: row.providerRef,
    failureReason: row.failureReason,
    expiresAt: row.expiresAt,
    createdAt: row.createdAt,
    completedAt: row.completedAt,
  };
}

function toRefund(row: RefundRow): RefundRecord {
  return {
    id: row.id,
    paymentId: row.paymentId,
    orderId: row.orderId,
    orderReference: row.orderReference,
    amount: row.amount,
    method: CHANNEL_FROM_DB[row.method] as "airtel" | "moov",
    phone: row.phone,
    reason: REASON_FROM_DB[row.reason],
    status: row.status === "DONE" ? "done" : "to_do",
    externalReference: row.externalReference,
    createdAt: row.createdAt,
    doneAt: row.doneAt,
  };
}

/**
 * Paiements (schéma `payments`, S5-T04). Les écritures rejoignent la transaction en cours (`TransactionContext`),
 * ouverte par le module orders (`OrderPayments.transaction`) : statut de la commande et paiement changent ensemble.
 */
@Injectable()
export class PrismaPaymentRepository implements PaymentRepository {
  constructor(private readonly tx: TransactionContext) {}

  async listForOrder(orderId: string): Promise<PaymentAttempt[]> {
    const rows = await this.tx.db.payment.findMany({
      where: { orderId },
      orderBy: { attempt: "asc" },
    });
    return rows.map(toAttempt);
  }

  async findById(id: string): Promise<PaymentAttempt | null> {
    const row = await this.tx.db.payment.findUnique({ where: { id } });
    return row ? toAttempt(row) : null;
  }

  async lock(id: string): Promise<PaymentAttempt | null> {
    const db = this.tx.db;
    const rows = await db.$queryRaw<{ id: string }[]>`
      SELECT "id" FROM "payments"."payments" WHERE "id" = ${id}::uuid FOR UPDATE`;
    if (!rows[0]) return null;
    return this.findById(id);
  }

  async insert(payment: NewPayment, now: Date): Promise<PaymentAttempt> {
    const row = await this.tx.db.payment.create({
      data: {
        id: randomUUID(),
        orderId: payment.orderId,
        accountId: payment.accountId,
        method: CHANNEL_TO_DB[payment.method],
        amount: payment.amount,
        phone: payment.phone,
        status: STATUS_TO_DB[payment.status],
        attempt: payment.attempt,
        provider: payment.provider,
        collectedBy: payment.collectedBy,
        expiresAt: payment.expiresAt,
        completedAt: payment.completedAt,
        createdAt: now,
        updatedAt: now,
      },
    });
    return toAttempt(row);
  }

  async setProviderRef(id: string, providerRef: string, now: Date): Promise<void> {
    await this.tx.db.payment.update({ where: { id }, data: { providerRef, updatedAt: now } });
  }

  async complete(
    id: string,
    status: Exclude<PaymentStatus, "pending">,
    now: Date,
    failureReason: string | null = null,
  ): Promise<void> {
    await this.tx.db.payment.update({
      where: { id },
      data: { status: STATUS_TO_DB[status], completedAt: now, failureReason, updatedAt: now },
    });
  }

  countForPhoneSince(phone: string, since: Date): Promise<number> {
    return this.tx.db.payment.count({
      where: {
        phone,
        createdAt: { gte: since },
        OR: [{ failureReason: null }, { failureReason: { not: PROVIDER_DOWN } }],
      },
    });
  }

  async findStale(now: Date, limit: number): Promise<string[]> {
    const rows = await this.tx.db.payment.findMany({
      where: { status: "PENDING", expiresAt: { lte: now } },
      orderBy: { expiresAt: "asc" },
      take: limit,
      select: { id: true },
    });
    return rows.map((r) => r.id);
  }
}

@Injectable()
export class PrismaRefundRepository implements RefundRepository {
  constructor(private readonly tx: TransactionContext) {}

  async createFor(
    payment: PaymentAttempt,
    orderReference: string,
    reason: RefundReasonCode,
    now: Date,
    amount = payment.amount,
  ): Promise<RefundRecord | null> {
    if (payment.method === "cod" || !payment.phone) return null;
    const db = this.tx.db;
    // Un seul remboursement par paiement (index unique) : un deuxième appel ne crée rien
    const inserted = await db.$executeRaw`
      INSERT INTO "payments"."refunds"
        ("id", "payment_id", "order_id", "order_reference", "amount", "method", "phone", "reason", "status",
         "created_at", "updated_at")
      VALUES (${randomUUID()}::uuid, ${payment.id}::uuid, ${payment.orderId}::uuid, ${orderReference},
        ${amount}, ${CHANNEL_TO_DB[payment.method]}::"payments"."payment_channel", ${payment.phone},
        ${REASON_TO_DB[reason]}::"payments"."refund_reason", 'TO_DO', ${now}, ${now})
      ON CONFLICT ("payment_id") DO NOTHING`;
    if (inserted === 0) return null;
    const row = await db.refund.findUnique({ where: { paymentId: payment.id } });
    return row ? toRefund(row) : null;
  }

  async findByExternalReference(externalReference: string): Promise<RefundRecord | null> {
    const row = await this.tx.db.refund.findUnique({ where: { externalReference } });
    return row ? toRefund(row) : null;
  }

  async list(status: "to_do" | "done", limit: number): Promise<RefundRecord[]> {
    const done = status === "done";
    const rows = await this.tx.db.refund.findMany({
      where: { status: done ? "DONE" : "TO_DO" },
      // À faire : la file de travail (plus anciens d'abord) ; faits : l'historique récent
      orderBy: done ? [{ doneAt: "desc" }, { id: "desc" }] : [{ createdAt: "asc" }, { id: "asc" }],
      take: limit,
    });
    return rows.map(toRefund);
  }

  async lock(id: string): Promise<RefundRecord | null> {
    const db = this.tx.db;
    const rows = await db.$queryRaw<{ id: string }[]>`
      SELECT "id" FROM "payments"."refunds" WHERE "id" = ${id}::uuid FOR UPDATE`;
    if (!rows[0]) return null;
    const row = await db.refund.findUnique({ where: { id } });
    return row ? toRefund(row) : null;
  }

  async markDone(
    id: string,
    externalReference: string,
    adminId: string,
    now: Date,
  ): Promise<RefundRecord> {
    const row = await this.tx.db.refund.update({
      where: { id },
      data: { status: "DONE", externalReference, doneBy: adminId, doneAt: now, updatedAt: now },
    });
    return toRefund(row);
  }
}

/** Notifications reçues (S5-T05) : l'identifiant est la clé primaire, un deuxième envoi n'écrit rien. */
@Injectable()
export class PrismaProviderEventRepository implements ProviderEventRepository {
  constructor(private readonly tx: TransactionContext) {}

  async record(
    event: { id: string; paymentId: string; type: string },
    now: Date,
  ): Promise<boolean> {
    const inserted = await this.tx.db.$executeRaw`
      INSERT INTO "payments"."provider_events" ("id", "payment_id", "type", "received_at")
      VALUES (${event.id}::uuid, ${event.paymentId}::uuid, ${event.type}, ${now})
      ON CONFLICT ("id") DO NOTHING`;
    return inserted === 1;
  }
}
