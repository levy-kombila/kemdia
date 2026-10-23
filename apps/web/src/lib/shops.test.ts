import { describe, expect, it } from "vitest";
import { parseShopFilters, productCountLabel, sellingSince, shopsHref } from "./shops";

describe("annuaire des boutiques (S7.5-T07)", () => {
  it("ville et quartier en liste blanche ; ville du cookie par défaut", () => {
    expect(parseShopFilters({}, "libreville")).toEqual({ city: "Libreville", page: 1 });
    expect(parseShopFilters({ ville: "Libreville", quartier: "Akébé" })).toEqual({
      city: "Libreville",
      neighborhood: "Akébé",
      page: 1,
    });
    // Quartier d'une autre ville, ville inconnue, page farfelue : ignorés
    expect(parseShopFilters({ ville: "Oyem", quartier: "Akébé" })).toEqual({
      city: "Oyem",
      page: 1,
    });
    expect(parseShopFilters({ ville: "Atlantis", page: "abc" })).toEqual({ page: 1 });
    // « ville= » vide : toutes les villes, même avec le cookie
    expect(parseShopFilters({ ville: "" }, "libreville")).toEqual({ page: 1 });
    expect(parseShopFilters({ page: "3" })).toEqual({ page: 3 });
  });

  it("adresses et libellés", () => {
    expect(shopsHref({ city: "Libreville", neighborhood: "Akébé", page: 2 })).toBe(
      "/boutiques?ville=Libreville&quartier=Ak%C3%A9b%C3%A9&page=2",
    );
    expect(shopsHref({ page: 1 })).toBe("/boutiques?ville=");
    expect(productCountLabel(0)).toBe("Pas encore de produit");
    expect(productCountLabel(1)).toBe("1 produit");
    expect(productCountLabel(12)).toBe("12 produits");
    expect(sellingSince("2026-10-15T10:00:00.000Z")).toBe("Vend sur Kemdia depuis octobre 2026");
  });
});
