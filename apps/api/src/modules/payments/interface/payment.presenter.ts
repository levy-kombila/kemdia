import type { Payment, Refund } from "@kemdia/contracts";
import type { PaymentView } from "../application/payment.service.js";
import type { RefundRecord } from "../application/ports.js";
import type { PaymentAttempt } from "../domain/payment.js";

export function presentPayment(
  payment: PaymentAttempt,
  orderReference: string,
  attemptsLeft: number,
): Payment {
  return {
    id: payment.id,
    orderReference,
    method: payment.method,
    amount: payment.amount,
    phone: payment.phone,
    status: payment.status,
    attempt: payment.attempt,
    attemptsLeft,
    failureReason: payment.failureReason,
    createdAt: payment.createdAt.toISOString(),
    completedAt: payment.completedAt?.toISOString() ?? null,
  };
}

export const presentPaymentView = (view: PaymentView): Payment =>
  presentPayment(view.payment, view.orderReference, view.attemptsLeft);

export function presentRefund(refund: RefundRecord): Refund {
  return {
    id: refund.id,
    orderReference: refund.orderReference,
    amount: refund.amount,
    method: refund.method,
    phone: refund.phone,
    reason: refund.reason,
    status: refund.status,
    externalReference: refund.externalReference,
    createdAt: refund.createdAt.toISOString(),
    doneAt: refund.doneAt?.toISOString() ?? null,
  };
}
