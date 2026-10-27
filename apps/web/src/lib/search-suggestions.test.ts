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
      shops: [
        { slug: "atelier-mbolo", name: "Atelier Mbolo", city: "Libreville", official: false },
        { slug: "../vendeur", name: "Piège", city: "Oyem", official: false },
      ],
    });
    expect(options.map((o) => [o.kind, o.href])).toEqual([
      ["rayon", "/categorie/audio"],
      ["marque", "/recherche?q=L%27Or%C3%A9al+%26+Co"],
      ["boutique", "/boutique/atelier-mbolo"],
      ["produit", "/produit/casque-pro"],
    ]);
    expect(options.find((o) => o.kind === "boutique")).toMatchObject({
      label: "Atelier Mbolo",
      city: "Libreville",
    });
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
    ).toEqual({
      products: [],
      categories: [],
      brands: ["Beats"],
      shops: [],
      correctedQuery: "beats",
    });
    // S8-T05 : boutique mal formée → rien ; boutiques gardées (2 au plus)
    expect(
      parseSuggestions({ products: [], categories: [], brands: [], shops: [{ slug: "a" }] }),
    ).toBeNull();
    expect(parseSuggestions({ products: [], categories: [], brands: [], shops: "x" })).toBeNull();
    const shop = { slug: "kemdia", name: "Kemdia", city: "Libreville", official: true };
    expect(
      parseSuggestions({ products: [], categories: [], brands: [], shops: [shop, shop, shop] })
        ?.shops,
    ).toHaveLength(2);
  });
});
