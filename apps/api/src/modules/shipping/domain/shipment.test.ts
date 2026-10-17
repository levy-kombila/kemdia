import { describe, expect, it } from "vitest";
import {
  canMove,
  cleanText,
  deliveryShares,
  validateTariffs,
  type ZoneTariff,
} from "./shipment.js";
import { ShippingError } from "./shipping-error.js";

const TARIFFS: ZoneTariff[] = [
  { id: "zone_1", baseFee: 0, freeThreshold: 25_000, daysMin: 1, daysMax: 2 },
  { id: "zone_2", baseFee: 2_000, freeThreshold: 50_000, daysMin: 2, daysMax: 3 },
  { id: "zone_3", baseFee: 3_000, freeThreshold: 75_000, daysMin: 3, daysMax: 4 },
  { id: "zone_4", baseFee: 4_000, freeThreshold: 100_000, daysMin: 4, daysMax: 7 },
];

const codeOf = (run: () => unknown) => {
  try {
    run();
  } catch (error) {
    return error instanceof ShippingError ? error.code : String(error);
  }
  return null;
};

describe("parts des frais de livraison (BR-021)", () => {
  it("Kemdia 15 % arrondis à l'entier inférieur, le transporteur le reste (choix du 2026-10-17)", () => {
    expect(deliveryShares(2_500)).toEqual({ kemdiaShare: 375, carrierShare: 2_125 });
    expect(deliveryShares(1_750)).toEqual({ kemdiaShare: 262, carrierShare: 1_488 });
    expect(deliveryShares(3_333)).toEqual({ kemdiaShare: 499, carrierShare: 2_834 });
    expect(deliveryShares(6)).toEqual({ kemdiaShare: 0, carrierShare: 6 });
  });

  it("livraison offerte : rien à partager ; montant invalide refusé", () => {
    expect(deliveryShares(0)).toEqual({ kemdiaShare: 0, carrierShare: 0 });
    expect(() => deliveryShares(-1)).toThrow(RangeError);
    expect(() => deliveryShares(10.5)).toThrow(RangeError);
  });

  it("jamais plus de 15 %, la somme des parts vaut toujours les frais", () => {
    for (let fee = 0; fee <= 20_000; fee += 7) {
      const { kemdiaShare, carrierShare } = deliveryShares(fee);
      expect(kemdiaShare + carrierShare).toBe(fee);
      expect(kemdiaShare * 100).toBeLessThanOrEqual(fee * 15);
    }
  });
});

describe("statuts d'une expédition", () => {
  it("en route → livrée ou échec ; échec → nouvelle tentative ou annulation ; livrée et annulée sont finales", () => {
    expect(canMove("in_transit", "delivered")).toBe(true);
    expect(canMove("in_transit", "failed")).toBe(true);
    expect(canMove("failed", "in_transit")).toBe(true);
    expect(canMove("failed", "cancelled")).toBe(true);
    expect(canMove("in_transit", "cancelled")).toBe(false);
    expect(canMove("failed", "delivered")).toBe(false);
    expect(canMove("delivered", "failed")).toBe(false);
    expect(canMove("cancelled", "in_transit")).toBe(false);
  });
});

describe("motif et note", () => {
  it("nettoyés : caractères de contrôle et invisibles retirés, espaces resserrés", () => {
    expect(cleanText("  Client\u0000 absent​  deux fois \n", "motif")).toBe(
      "Client absent deux fois",
    );
  });

  it("3 à 200 caractères", () => {
    expect(codeOf(() => cleanText(" a\u0007\u200b ", "motif"))).toBe("EXPEDITION_INVALIDE");
    expect(codeOf(() => cleanText("x".repeat(201), "note"))).toBe("EXPEDITION_INVALIDE");
    expect(cleanText("x".repeat(200), "note")).toHaveLength(200);
  });
});

describe("barème", () => {
  it("rendu dans l'ordre des zones, sans champ en trop", () => {
    const shuffled = [
      TARIFFS[3]!,
      TARIFFS[1]!,
      TARIFFS[0]!,
      { ...TARIFFS[2]!, extra: 1 } as ZoneTariff,
    ];
    expect(validateTariffs(shuffled)).toEqual(TARIFFS);
  });

  it("les 4 zones une fois chacune", () => {
    expect(codeOf(() => validateTariffs(TARIFFS.slice(0, 3)))).toBe("TARIFS_INVALIDES");
    expect(codeOf(() => validateTariffs([...TARIFFS.slice(0, 3), TARIFFS[0]!]))).toBe(
      "TARIFS_INVALIDES",
    );
  });

  it("montants entiers dans les bornes, délai minimum ≤ maximum", () => {
    const bad = (change: Partial<ZoneTariff>) =>
      codeOf(() => validateTariffs([{ ...TARIFFS[0]!, ...change }, ...TARIFFS.slice(1)]));
    expect(bad({ baseFee: -1 })).toBe("TARIFS_INVALIDES");
    expect(bad({ baseFee: 100_001 })).toBe("TARIFS_INVALIDES");
    expect(bad({ baseFee: 12.5 })).toBe("TARIFS_INVALIDES");
    expect(bad({ freeThreshold: 10_000_001 })).toBe("TARIFS_INVALIDES");
    expect(bad({ daysMin: 3, daysMax: 2 })).toBe("TARIFS_INVALIDES");
    expect(bad({ daysMax: 31 })).toBe("TARIFS_INVALIDES");
    expect(bad({ baseFee: 100_000, freeThreshold: 0, daysMin: 0, daysMax: 30 })).toBeNull();
  });
});
