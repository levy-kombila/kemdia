import { describe, expect, it } from "vitest";
import { countActiveFilters, filtersToParams, matchesFilters, parseFilters } from "./filters";

const brands = ["Apple", "Beats", "JBL"];

describe("parseFilters (liste blanche)", () => {
  it("lit les filtres valides", () => {
    const f = parseFilters(
      { prix: "50000-150000", marque: "Beats,JBL", stock: "1", promo: "1", note: "4" },
      brands,
    );
    expect(f).toEqual({
      price: "50000-150000",
      brands: ["Beats", "JBL"],
      inStock: true,
      onlyDeals: true,
      minRating: 4,
    });
    expect(countActiveFilters(f)).toBe(6);
    expect(filtersToParams(f)).toEqual({
      prix: "50000-150000",
      marque: "Beats,JBL",
      stock: "1",
      promo: "1",
      note: "4",
    });
  });

  it("ignore toute valeur inconnue ou malveillante", () => {
    const f = parseFilters(
      {
        prix: "0-999999999",
        marque: "<script>,Apple,Apple,'; DROP TABLE",
        stock: "oui",
        note: "5",
      },
      brands,
    );
    expect(f).toEqual({
      price: undefined,
      brands: ["Apple"],
      inStock: false,
      onlyDeals: false,
      minRating: undefined,
    });
  });
});

describe("matchesFilters", () => {
  const p = { price: 120_000, oldPrice: 150_000, brand: "Beats", stock: 0, rating: 4.2 };
  it("applique chaque critère", () => {
    expect(matchesFilters(p, parseFilters({ prix: "50000-150000" }, brands))).toBe(true);
    expect(matchesFilters(p, parseFilters({ prix: "plus-300000" }, brands))).toBe(false);
    expect(matchesFilters(p, parseFilters({ marque: "JBL" }, brands))).toBe(false);
    expect(matchesFilters(p, parseFilters({ stock: "1" }, brands))).toBe(false);
    expect(matchesFilters(p, parseFilters({ promo: "1", note: "4" }, brands))).toBe(true);
  });
});
