import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  KEMDIA_DELIVERY_SHARE_PERCENT,
  SHIPMENT_STATUSES,
  SHIPPING_ERROR_CODES,
  SHIPPING_LIMITS,
} from "@kemdia/contracts/constants";
import { ZONE_IDS as CONTRACT_ZONE_IDS, ZONES } from "@kemdia/contracts/delivery";
import {
  SHIPMENT_STATUSES as DOMAIN_STATUSES,
  SHIPPING_RULES,
  ZONE_IDS,
} from "../src/modules/shipping/domain/shipment.js";
import { SHIPPING_ERROR_STATUS } from "../src/modules/shipping/interface/shipping-http-errors.js";

/**
 * Règles des livraisons écrites à trois endroits : contrat (site), domaine de l'API et migration SQL. Si l'une change
 * seule, ce test échoue (S7-T01).
 */
const migration = readFileSync(
  new URL("../prisma/migrations/20261017150000_livraisons/migration.sql", import.meta.url),
  "utf8",
);

describe("Livraisons : mêmes règles dans le contrat, le domaine et la base (S7-T01)", () => {
  it("statuts, zones et codes d'erreur", () => {
    expect([...DOMAIN_STATUSES]).toEqual([...SHIPMENT_STATUSES]);
    expect([...ZONE_IDS]).toEqual([...CONTRACT_ZONE_IDS]);
    expect(Object.keys(SHIPPING_ERROR_STATUS).sort()).toEqual([...SHIPPING_ERROR_CODES].sort());
    expect(migration).toContain(
      `ENUM (${SHIPMENT_STATUSES.map((s) => `'${s.toUpperCase()}'`).join(", ")})`,
    );
  });

  it("part de Kemdia (BR-021) et bornes du barème", () => {
    expect(SHIPPING_RULES.kemdiaSharePercent).toBe(KEMDIA_DELIVERY_SHARE_PERCENT);
    expect(migration).toContain(`("delivery_fee" * ${KEMDIA_DELIVERY_SHARE_PERCENT}) / 100`);
    for (const key of [
      "reasonMin",
      "reasonMax",
      "baseFeeMax",
      "freeThresholdMax",
      "daysMax",
      "listMax",
    ] as const) {
      expect(SHIPPING_RULES[key]).toBe(SHIPPING_LIMITS[key]);
    }
    expect(migration).toContain(`"base_fee" BETWEEN 0 AND ${SHIPPING_LIMITS.baseFeeMax}`);
    expect(migration).toContain(
      `"free_threshold" BETWEEN 0 AND ${SHIPPING_LIMITS.freeThresholdMax}`,
    );
    expect(migration).toContain(`"days_min" BETWEEN 0 AND ${SHIPPING_LIMITS.daysMax}`);
    expect(migration).toContain(`"attempt" BETWEEN 1 AND ${SHIPPING_RULES.maxAttempts}`);
    expect(migration).toContain(`VARCHAR(${SHIPPING_LIMITS.reasonMax})`);
  });

  it("barème de départ de la migration = barème du contrat", () => {
    for (const id of CONTRACT_ZONE_IDS) {
      const z = ZONES[id];
      expect(migration).toContain(
        `('${id}', ${z.baseFee}, ${z.freeThreshold}, ${z.daysMin}, ${z.daysMax})`,
      );
    }
  });
});
