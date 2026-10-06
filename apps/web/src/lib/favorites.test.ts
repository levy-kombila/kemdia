import { describe, expect, it } from "vitest";
import {
  isFavorite,
  MAX_FAVORITES,
  parseStoredFavorites,
  toggleFavorite,
  type Favorite,
} from "./favorites";

/** Identifiant UUID dérivé d'un petit numéro, pour garder les tests lisibles. */
const uuid = (n: string) => `00000000-0000-4000-8000-${n.padStart(12, "0")}`;

const fav = (id: string): Favorite => ({
  productId: uuid(id),
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
    expect(list.map((f) => f.productId)).toEqual([uuid("2"), uuid("1")]);
    list = toggleFavorite(list, fav("1"));
    expect(isFavorite(list, uuid("1"))).toBe(false);
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
    expect(list.map((f) => f.productId)).toEqual([uuid("2")]);
    expect(list[0]!.image).toBeNull();
    expect(parseStoredFavorites("{pas du json")).toEqual([]);
  });
  it("écarte les favoris enregistrés avec les anciens identifiants numériques (S3-T05)", () => {
    const old = { ...fav("1"), productId: "38" };
    expect(parseStoredFavorites(JSON.stringify([old, fav("2")])).map((f) => f.productId)).toEqual([
      uuid("2"),
    ]);
  });
  it("garde la variante à ajouter au panier si elle est valide", () => {
    const variantId = uuid("99");
    expect(parseStoredFavorites(JSON.stringify([{ ...fav("1"), variantId }]))[0]?.variantId).toBe(
      variantId,
    );
    expect(
      parseStoredFavorites(JSON.stringify([{ ...fav("1"), variantId: "x" }]))[0],
    ).not.toHaveProperty("variantId");
  });
});
