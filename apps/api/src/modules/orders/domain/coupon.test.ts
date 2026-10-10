import { describe, expect, it } from "vitest";
import {
  assertUsable,
  computeDiscount,
  normalizeCouponCode,
  validateCouponRules,
  type Coupon,
  type CouponRules,
} from "./coupon.js";
import { OrdersError } from "./orders-error.js";

const codeOf = (run: () => unknown): string | undefined => {
  try {
    run();
  } catch (error) {
    return error instanceof OrdersError ? error.code : `autre : ${String(error)}`;
  }
  return undefined;
};

const NOW = new Date("2026-10-10T10:00:00Z");
const RULES: CouponRules = {
  code: "BIENVENUE10",
  kind: "percent",
  value: 10,
  maxDiscount: null,
  minSubtotal: null,
  startsAt: new Date("2026-10-01T00:00:00Z"),
  endsAt: null,
  usageLimit: null,
  perAccountLimit: 1,
  stackableWithSales: false,
};
const COUPON: Coupon = { ...RULES, id: "c", usedCount: 0, active: true, createdAt: NOW };
const line = (lineTotal: number, onSale = false) => ({ lineTotal, onSale });

describe("code coupon (S5-T03)", () => {
  it("sans casse ni espaces autour ; 4 à 20 lettres, chiffres ou tirets", () => {
    expect(normalizeCouponCode("  bienvenue10 ")).toBe("BIENVENUE10");
    expect(normalizeCouponCode("soldes-2026")).toBe("SOLDES-2026");
    for (const bad of ["abc", "x".repeat(21), "-noel", "no el", "noël", "noel;"])
      expect(normalizeCouponCode(bad)).toBeNull();
  });
});

describe("règles d'un nouveau coupon", () => {
  it("acceptées et code en majuscules", () => {
    expect(validateCouponRules({ ...RULES, code: "noel" }).code).toBe("NOEL");
  });

  it("refusées : pourcentage > 90, plafond sur un montant fixe, fin avant début, limites nulles", () => {
    for (const bad of [
      { ...RULES, value: 91 },
      { ...RULES, value: 0 },
      { ...RULES, kind: "fixed" as const, maxDiscount: 1_000 },
      { ...RULES, endsAt: new Date("2026-09-01T00:00:00Z") },
      { ...RULES, usageLimit: 0 },
      { ...RULES, perAccountLimit: 0 },
      { ...RULES, minSubtotal: -1 },
      { ...RULES, code: "x" },
      { ...RULES, kind: "fixed" as const, value: 5_000, minSubtotal: null },
      { ...RULES, kind: "fixed" as const, value: 5_000, minSubtotal: 5_000 },
      { ...RULES, usageLimit: 3_000_000_000 },
      { ...RULES, perAccountLimit: 1_001 },
      { ...RULES, minSubtotal: 200_000_000 },
      { ...RULES, maxDiscount: 20_000_000 },
    ]) {
      expect(() => validateCouponRules(bad)).toThrow(RangeError);
    }
  });
});

describe("utilisable maintenant ? (BR-030)", () => {
  it("désactivé = même réponse qu'un code inconnu", () => {
    expect(codeOf(() => assertUsable({ ...COUPON, active: false }, NOW, 0))).toBe(
      "COUPON_INVALIDE",
    );
  });

  it("pas encore valable, expiré, épuisé, déjà utilisé par ce compte", () => {
    expect(
      codeOf(() => assertUsable({ ...COUPON, startsAt: new Date("2026-11-01") }, NOW, 0)),
    ).toBe("COUPON_INVALIDE"); // pas encore valable : même réponse qu'un code inconnu
    expect(codeOf(() => assertUsable({ ...COUPON, endsAt: NOW }, NOW, 0))).toBe("COUPON_EXPIRE");
    expect(codeOf(() => assertUsable({ ...COUPON, usageLimit: 5, usedCount: 5 }, NOW, 0))).toBe(
      "COUPON_EPUISE",
    );
    expect(codeOf(() => assertUsable(COUPON, NOW, 1))).toBe("COUPON_DEJA_UTILISE");
    expect(
      codeOf(() => assertUsable({ ...COUPON, perAccountLimit: null }, NOW, 50)),
    ).toBeUndefined();
    expect(codeOf(() => assertUsable(COUPON, NOW, 0))).toBeUndefined();
  });
});

describe("réduction (articles seulement)", () => {
  it("pourcentage arrondi à l'entier inférieur, plafonné", () => {
    expect(computeDiscount(RULES, [line(12_345)])).toBe(1_234);
    expect(computeDiscount({ ...RULES, maxDiscount: 500 }, [line(12_345)])).toBe(500);
  });

  it("montant fixe : jamais plus que les articles éligibles, jamais tous les articles (pas de commande à 0)", () => {
    const fixed = { ...RULES, kind: "fixed" as const, value: 5_000 };
    expect(computeDiscount(fixed, [line(20_000)])).toBe(5_000);
    expect(computeDiscount(fixed, [line(3_000), line(10_000, true)])).toBe(3_000);
    expect(computeDiscount(fixed, [line(3_000)])).toBe(2_999);
  });

  it("BR-031 : pas sur les articles en promotion, sauf coupon cumulable", () => {
    expect(computeDiscount(RULES, [line(10_000), line(50_000, true)])).toBe(1_000);
    expect(
      computeDiscount({ ...RULES, stackableWithSales: true }, [line(10_000), line(50_000, true)]),
    ).toBe(6_000);
    expect(codeOf(() => computeDiscount(RULES, [line(50_000, true)]))).toBe(
      "COUPON_NON_APPLICABLE",
    );
  });

  it("minimum de commande : sur le total des articles", () => {
    const min = { ...RULES, minSubtotal: 20_000 };
    expect(codeOf(() => computeDiscount(min, [line(19_999)]))).toBe("COUPON_MINIMUM_NON_ATTEINT");
    expect(computeDiscount(min, [line(15_000), line(5_000, true)])).toBe(1_500);
  });
});
