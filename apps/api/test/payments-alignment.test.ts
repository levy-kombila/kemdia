import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  CANCEL_REASONS,
  MAX_PAYMENT_ATTEMPTS,
  PAYMENT_ATTEMPT_MINUTES,
  PAYMENT_ERROR_CODES,
  PAYMENT_STATUSES,
  REFUND_REASONS,
} from "@kemdia/contracts/constants";
import { DEFAULT_COD_RULE } from "@kemdia/contracts/delivery";
import * as payment from "../src/modules/payments/domain/payment.js";
import { COD_MAX_TOTAL_LIMIT } from "../src/modules/orders/application/cod-settings.service.js";
import { PAYMENTS_ERROR_STATUS } from "../src/modules/payments/interface/payments-http-errors.js";

/** Règles des paiements écrites dans le contrat, le domaine et la migration SQL (S5-T04) : si l'une change seule, échec. */
const migration = readFileSync(
  new URL("../prisma/migrations/20261010190000_paiements/migration.sql", import.meta.url),
  "utf8",
);

describe("Paiements : mêmes règles dans le contrat, le domaine et la base (S5-T04)", () => {
  it("statuts, nombre et durée des essais", () => {
    expect([...payment.PAYMENT_STATUSES]).toEqual([...PAYMENT_STATUSES]);
    expect(payment.MAX_PAYMENT_ATTEMPTS).toBe(MAX_PAYMENT_ATTEMPTS);
    expect(payment.ATTEMPT_MS).toBe(PAYMENT_ATTEMPT_MINUTES * 60_000);
    expect(migration).toContain(`CHECK ("attempt" BETWEEN 1 AND ${payment.MAX_PAYMENT_ROWS})`);
  });

  it("chaque code d'erreur des paiements a son statut HTTP", () => {
    expect(Object.keys(PAYMENTS_ERROR_STATUS).sort()).toEqual([...PAYMENT_ERROR_CODES].sort());
  });

  it("raisons d'annulation et de remboursement", () => {
    expect(CANCEL_REASONS).toContain("admin");
    expect([...REFUND_REASONS].sort()).toEqual(["annulation_admin", "paiement_non_attendu"]);
  });

  it("réglage du paiement à la livraison : valeurs de départ et borne = contrat", () => {
    expect(migration).toContain(
      `VALUES (1, ARRAY[${DEFAULT_COD_RULE.zones.map((z) => `'${z}'`).join(", ")}]::VARCHAR(10)[], ${DEFAULT_COD_RULE.maxTotal})`,
    );
    expect(migration).toContain(`CHECK ("max_total" BETWEEN 0 AND ${COD_MAX_TOTAL_LIMIT})`);
  });
});
