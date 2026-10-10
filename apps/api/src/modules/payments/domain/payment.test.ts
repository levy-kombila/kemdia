import { describe, expect, it } from "vitest";
import {
  ATTEMPT_MS,
  attemptExpiry,
  attemptsLeft,
  effectiveStatus,
  nextAttempt,
  normalizeFailureReason,
  type PaymentAttempt,
} from "./payment.js";
import { PaymentsError } from "./payments-error.js";

const now = new Date("2026-10-10T12:00:00Z");
const later = (ms: number) => new Date(now.getTime() + ms);
const order = {
  status: "pending_payment",
  paymentMethod: "airtel" as const,
  paymentDueAt: later(20 * 60_000),
};
const attempt = (over: Partial<PaymentAttempt> = {}): PaymentAttempt => ({
  id: "p",
  orderId: "o",
  accountId: "a",
  method: "airtel",
  amount: 10_000,
  phone: "+241077123456",
  status: "failed",
  attempt: 1,
  provider: "simule",
  providerRef: null,
  failureReason: null,
  expiresAt: later(ATTEMPT_MS),
  createdAt: now,
  completedAt: now,
  ...over,
});
const codeOf = (run: () => unknown) => {
  try {
    run();
  } catch (error) {
    if (error instanceof PaymentsError) return error.code;
    throw error;
  }
  return null;
};

describe("Paiement : essais (S5-T04)", () => {
  it("premier essai, puis numéro suivant après un échec ou une expiration", () => {
    expect(nextAttempt(order, [], now)).toBe(1);
    expect(nextAttempt(order, [attempt(), attempt({ status: "expired", attempt: 2 })], now)).toBe(
      3,
    );
  });

  it("3 essais au plus", () => {
    const three = [1, 2, 3].map((n) => attempt({ attempt: n }));
    expect(codeOf(() => nextAttempt(order, three, now))).toBe("TROP_D_ESSAIS_PAIEMENT");
    expect(attemptsLeft(three)).toBe(0);
    expect(attemptsLeft([attempt()])).toBe(2);
  });

  it("un refus de l'opérateur injoignable ne compte pas (10 lignes au plus par commande)", () => {
    const down = (n: number) => attempt({ attempt: n, failureReason: "operateur_indisponible" });
    expect(nextAttempt(order, [down(1), down(2), attempt({ attempt: 3 })], now)).toBe(4);
    expect(attemptsLeft([down(1), down(2), attempt({ attempt: 3 })])).toBe(2);
    const many = Array.from({ length: 10 }, (_, i) => down(i + 1));
    expect(codeOf(() => nextAttempt(order, many, now))).toBe("TROP_D_ESSAIS_PAIEMENT");
    expect(attemptsLeft(many)).toBe(0);
  });

  it("un essai en attente bloque le suivant, sauf s'il a dépassé son délai", () => {
    const pending = attempt({ status: "pending", completedAt: null });
    expect(codeOf(() => nextAttempt(order, [pending], now))).toBe("PAIEMENT_EN_COURS");
    expect(nextAttempt(order, [pending], later(ATTEMPT_MS))).toBe(2);
    expect(effectiveStatus(pending, now)).toBe("pending");
    expect(effectiveStatus(pending, later(ATTEMPT_MS))).toBe("expired");
    expect(effectiveStatus(attempt({ status: "succeeded" }), later(ATTEMPT_MS))).toBe("succeeded");
  });

  it("refusé : à la livraison, déjà payée, annulée, délai de la commande passé", () => {
    expect(codeOf(() => nextAttempt({ ...order, paymentMethod: "cod" }, [], now))).toBe(
      "PAIEMENT_IMPOSSIBLE",
    );
    expect(codeOf(() => nextAttempt({ ...order, status: "confirmed" }, [], now))).toBe(
      "PAIEMENT_IMPOSSIBLE",
    );
    expect(codeOf(() => nextAttempt({ ...order, status: "cancelled" }, [], now))).toBe(
      "PAIEMENT_IMPOSSIBLE",
    );
    expect(codeOf(() => nextAttempt({ ...order, paymentDueAt: now }, [], now))).toBe(
      "PAIEMENT_IMPOSSIBLE",
    );
  });

  it("un essai dure 3 minutes, sans dépasser l'échéance de la commande", () => {
    expect(attemptExpiry(now, later(20 * 60_000))).toEqual(later(ATTEMPT_MS));
    expect(attemptExpiry(now, later(60_000))).toEqual(later(60_000));
  });

  it("raison d'échec du fournisseur : courte et sans caractères inattendus", () => {
    expect(normalizeFailureReason("Solde_Insuffisant")).toBe("solde_insuffisant");
    expect(normalizeFailureReason("<script>")).toBe("script");
    expect(normalizeFailureReason(undefined)).toBe("refuse");
    expect(normalizeFailureReason("x".repeat(200))).toHaveLength(60);
  });
});
