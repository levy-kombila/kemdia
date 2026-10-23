import { describe, expect, it } from "vitest";
import {
  MAX_BRANDS,
  MAX_PAGE,
  MAX_PAGE_SIZE,
  MAX_TERMS,
  parseProductSearch,
} from "./product-search.js";

describe("parseProductSearch — validation des recherches (leçon MED-13)", () => {
  it("valeurs par défaut", () => {
    expect(parseProductSearch({})).toEqual({
      terms: [],
      sort: "pertinence",
      page: 1,
      pageSize: 20,
      brands: [],
      inStock: false,
      onlyDeals: false,
      promotionsOnly: false,
      exact: false,
    });
  });

  it("lit les paramètres d'URL (chaînes)", () => {
    expect(
      parseProductSearch({
        categorySlug: "telephones",
        q: "Écouteurs  bluetooth",
        sort: "prix-asc",
        page: "2",
        pageSize: "12",
        priceMin: "50000",
        priceMax: "150000",
        brands: "Apple, Samsung,Apple",
        inStock: "1",
        onlyDeals: "true",
        minRating: "4",
      }),
    ).toEqual({
      categorySlug: "telephones",
      terms: ["ecouteurs", "bluetooth"],
      sort: "prix-asc",
      page: 2,
      pageSize: 12,
      priceMin: 50_000,
      priceMax: 150_000,
      brands: ["Apple", "Samsung"],
      inStock: true,
      onlyDeals: true,
      minRating: 4,
      promotionsOnly: false,
      exact: false,
    });
  });

  it("ignore les valeurs farfelues au lieu d'échouer", () => {
    const search = parseProductSearch({
      categorySlug: "../../etc",
      sort: "DROP TABLE",
      page: "-3",
      pageSize: "100000",
      priceMin: "abc",
      priceMax: "1e9",
      inStock: "peut-être",
      minRating: "9",
      brands: { toString: () => "x" },
    });
    expect(search).toEqual({
      terms: [],
      sort: "pertinence",
      page: 1,
      pageSize: MAX_PAGE_SIZE,
      brands: [],
      inStock: false,
      onlyDeals: false,
      promotionsOnly: false,
      exact: false,
    });
  });

  it("borne tout ce qui pourrait alourdir la base", () => {
    const search = parseProductSearch({
      page: String(MAX_PAGE + 10),
      q: "a b c d e f g h i j k l",
      brands: Array.from({ length: 20 }, (_, i) => `Marque ${i}`),
    });
    expect(search.page).toBe(MAX_PAGE);
    expect(search.terms).toHaveLength(MAX_TERMS);
    expect(search.brands).toHaveLength(MAX_BRANDS);
  });

  it("sélection (badge) : seules les valeurs du contrat sont reconnues", () => {
    expect(parseProductSearch({ badge: "bestseller" }).badge).toBe("bestseller");
    expect(parseProductSearch({ badge: "admin" })).not.toHaveProperty("badge");
  });

  it("tri « ventes » accepté (les plus demandés d'abord)", () => {
    expect(parseProductSearch({ sort: "ventes" }).sort).toBe("ventes");
  });

  it("portée « promotions » (page Promotions) : seule valeur reconnue", () => {
    expect(parseProductSearch({ scope: "promotions" }).promotionsOnly).toBe(true);
    expect(parseProductSearch({ scope: "tout" }).promotionsOnly).toBe(false);
  });

  it("prix maximum inférieur au minimum : ignoré", () => {
    expect(parseProductSearch({ priceMin: 100, priceMax: 50 })).toMatchObject({ priceMin: 100 });
    expect(parseProductSearch({ priceMin: 100, priceMax: 50 })).not.toHaveProperty("priceMax");
  });
});
