import { describe, expect, it } from "vitest";
import { countActiveFilters, filtersToParams, filtersToQuery, parseFilters } from "./filters";

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

describe("filtersToQuery", () => {
  it("traduit les filtres de l'URL en paramètres de l'API", () => {
    expect(
      filtersToQuery(
        parseFilters(
          { prix: "50000-150000", marque: "Beats", stock: "1", promo: "1", note: "4" },
          brands,
        ),
      ),
    ).toEqual({
      priceMin: 50_000,
      priceMax: 150_000,
      brands: ["Beats"],
      inStock: true,
      onlyDeals: true,
      minRating: 4,
    });
    expect(filtersToQuery(parseFilters({}, brands))).toEqual({});
  });
});
