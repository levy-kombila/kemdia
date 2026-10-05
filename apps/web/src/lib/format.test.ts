import { describe, expect, it } from "vitest";
import { discountPercent, formatFCFA, normalize, truncate } from "./format";

describe("formatFCFA", () => {
  it("formate avec séparateur de milliers et suffixe FCFA", () => {
    expect(formatFCFA(125000)).toBe("125 000 FCFA");
    expect(formatFCFA(0)).toBe("0 FCFA");
  });
  it("arrondit les décimales (pas de centimes en FCFA)", () => {
    expect(formatFCFA(999.6)).toBe("1 000 FCFA");
  });
});

describe("discountPercent", () => {
  it("calcule la remise arrondie", () => expect(discountPercent(80000, 100000)).toBe(20));
  it("renvoie null sans ancien prix ou si l'ancien prix est inférieur", () => {
    expect(discountPercent(100, null)).toBeNull();
    expect(discountPercent(100, 90)).toBeNull();
    expect(discountPercent(100, 100)).toBeNull();
  });
});

describe("normalize / truncate", () => {
  it("supprime accents et majuscules", () =>
    expect(normalize("  Électroménager ")).toBe("electromenager"));
  it("tronque avec une ellipse", () => {
    expect(truncate("abcdef", 4)).toBe("abc…");
    expect(truncate("abc", 4)).toBe("abc");
  });
});
