import { describe, expect, it } from "vitest";
import {
  isFavorite,
  MAX_FAVORITES,
  parseStoredFavorites,
  toggleFavorite,
  type Favorite,
} from "./favorites";

const fav = (id: string): Favorite => ({
  productId: id,
  slug: `produit-${id}`,
  title: `Produit ${id}`,
  price: 10_000,
  oldPrice: null,
  image: "/images/products/x.webp",
  inStock: true,
  addedAt: 1,
});

describe("toggleFavorite", () => {
  it("ajoute en tête puis retire", () => {
    let list = toggleFavorite([fav("1")], fav("2"));
    expect(list.map((f) => f.productId)).toEqual(["2", "1"]);
    list = toggleFavorite(list, fav("1"));
    expect(isFavorite(list, "1")).toBe(false);
  });
  it(`est limité à ${MAX_FAVORITES} produits`, () => {
    let list: Favorite[] = [];
    for (let i = 0; i < MAX_FAVORITES + 5; i++) list = toggleFavorite(list, fav(String(i)));
    expect(list).toHaveLength(MAX_FAVORITES);
  });
});

describe("parseStoredFavorites (stockage non fiable)", () => {
  it("garde les entrées valides", () => {
    expect(parseStoredFavorites(JSON.stringify([fav("1")]))).toEqual([fav("1")]);
  });
  it("rejette les entrées altérées ou dangereuses", () => {
    const raw = JSON.stringify([
      { ...fav("1"), slug: "../../admin" },
      { ...fav("2"), image: "https://pirate.com/x.png" },
      { ...fav("3"), price: -5 },
      fav("2"),
      "texte",
    ]);
    const list = parseStoredFavorites(raw);
    expect(list.map((f) => f.productId)).toEqual(["2"]);
    expect(list[0]!.image).toBeNull();
    expect(parseStoredFavorites("{pas du json")).toEqual([]);
  });
});
