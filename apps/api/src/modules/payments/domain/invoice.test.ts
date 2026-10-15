import { describe, expect, it } from "vitest";
import { assertInvoiceAmounts, formatInvoiceNumber, invoiceDate, invoiceYear } from "./invoice.js";

describe("Factures (S5-T06)", () => {
  it("numéros par année et par type, sur 6 chiffres", () => {
    expect(formatInvoiceNumber("invoice", 2026, 1)).toBe("KMD-F-2026-000001");
    expect(formatInvoiceNumber("credit_note", 2027, 42)).toBe("KMD-A-2027-000042");
    expect(() => formatInvoiceNumber("invoice", 2026, 0)).toThrow();
    expect(() => formatInvoiceNumber("invoice", 2026, 1_000_000)).toThrow();
  });

  it("année et date à l'heure du Gabon (UTC+1)", () => {
    const lateNight = new Date("2026-12-31T23:30:00Z"); // 1er janvier 2027, 0 h 30 à Libreville
    expect(invoiceYear(lateNight)).toBe(2027);
    expect(invoiceDate(lateNight)).toBe("01/01/2027");
    expect(invoiceYear(new Date("2026-12-31T22:59:00Z"))).toBe(2026);
  });

  it("montants cohérents exigés", () => {
    const lines = [
      { title: "T", variantName: "", quantity: 2, unitPrice: 1_000, lineTotal: 2_000 },
    ];
    expect(() =>
      assertInvoiceAmounts({
        subtotal: 2_000,
        discount: 500,
        deliveryFee: 1_000,
        total: 2_500,
        lines,
      }),
    ).not.toThrow();
    expect(() =>
      assertInvoiceAmounts({ subtotal: 2_000, discount: 0, deliveryFee: 0, total: 1_999, lines }),
    ).toThrow();
    expect(() =>
      assertInvoiceAmounts({ subtotal: 3_000, discount: 0, deliveryFee: 0, total: 3_000, lines }),
    ).toThrow();
    expect(() =>
      assertInvoiceAmounts({ subtotal: 0, discount: 0, deliveryFee: 0, total: 0, lines: [] }),
    ).toThrow();
  });
});
