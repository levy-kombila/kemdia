import { describe, expect, it } from "vitest";
import { parseSuggestions, suggestionOptions, wantsSuggestions } from "./search-suggestions";

describe("suggestions pendant la frappe (S7.5-T06)", () => {
  it("dès 2 lettres, jamais au-delà de la longueur maximale", () => {
    expect(wantsSuggestions("a", 100)).toBe(false);
    expect(wantsSuggestions("  a ", 100)).toBe(false);
    expect(wantsSuggestions("ab", 100)).toBe(true);
    expect(wantsSuggestions("x".repeat(101), 100)).toBe(false);
  });

  it("lignes : rayons, marques puis produits, adresses construites par le site", () => {
    const options = suggestionOptions({
      products: [
        { slug: "casque-pro", title: "Casque Pro", image: null, price: 25_000 },
        { slug: "../../evil", title: "Piège", image: null, price: 1 },
      ],
      categories: [{ slug: "audio", name: "Audio" }],
      brands: ["L'Oréal & Co"],
    });
    expect(options.map((o) => [o.kind, o.href])).toEqual([
      ["rayon", "/categorie/audio"],
      ["marque", "/recherche?q=L%27Or%C3%A9al+%26+Co"],
      ["produit", "/produit/casque-pro"],
    ]);
  });

  it("réponse inattendue : pas de suggestions", () => {
    expect(parseSuggestions(null)).toBeNull();
    expect(parseSuggestions({ products: [], categories: [] })).toBeNull();
    expect(parseSuggestions({ products: [{ slug: 1 }], categories: [], brands: [] })).toBeNull();
    expect(
      parseSuggestions({ products: [], categories: [], brands: [], correctedQuery: 3 }),
    ).toBeNull();
    expect(
      parseSuggestions({
        products: [],
        categories: [],
        brands: ["Beats"],
        correctedQuery: "beats",
      }),
    ).toEqual({ products: [], categories: [], brands: ["Beats"], correctedQuery: "beats" });
  });
});
