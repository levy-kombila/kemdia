import { describe, expect, it } from "vitest";
import {
  getCategoryBySlug,
  getCategoryPath,
  getCategoryTree,
  getDescendantIds,
  getProductBySlug,
  queryProducts,
} from "./catalog";

describe("catalogue", () => {
  it("construit un arbre avec 5 univers racines", () => {
    const roots = getCategoryTree();
    expect(roots.map((r) => r.slug)).toEqual(
      expect.arrayContaining([
        "high-tech",
        "mode",
        "maison-cuisine",
        "beaute-sante",
        "sport-loisirs",
      ]),
    );
    expect(roots.every((r) => r.parentId === null)).toBe(true);
  });

  it("fil d'Ariane et descendants", () => {
    const leaf = getCategoryBySlug("smartphones-apple-iphone")!;
    expect(getCategoryPath(leaf.id).map((c) => c.slug)).toEqual([
      "high-tech",
      "high-tech-smartphones",
      "smartphones-apple-iphone",
    ]);
    const root = getCategoryBySlug("high-tech")!;
    expect(getDescendantIds(root.id).has(leaf.id)).toBe(true);
  });

  it("filtre par catégorie (descendants inclus)", () => {
    const root = getCategoryBySlug("beaute-sante")!;
    const r = queryProducts({ categoryId: root.id, pageSize: 100 });
    expect(r.total).toBeGreaterThan(0);
    for (const p of r.items) expect(getDescendantIds(root.id).has(p.categoryId)).toBe(true);
  });

  it("trie par prix", () => {
    const { items } = queryProducts({ sort: "prix-asc", pageSize: 100 });
    for (let i = 1; i < items.length; i++)
      expect(items[i].price).toBeGreaterThanOrEqual(items[i - 1].price);
  });

  it("recherche insensible aux accents et à la casse", () => {
    const sansAccent = queryProducts({ q: "velo", pageSize: 100 }).total;
    const avecAccent = queryProducts({ q: "VÉLO", pageSize: 100 }).total;
    expect(sansAccent).toBe(avecAccent);
  });

  it("pagine et ramène une page hors bornes dans l'intervalle", () => {
    const r = queryProducts({ page: 9999, pageSize: 12 });
    expect(r.page).toBe(r.totalPages);
    expect(r.items.length).toBeGreaterThan(0);
  });

  it("promotions : uniquement des produits avec ancien prix supérieur", () => {
    const { items } = queryProducts({ onlyDeals: true, pageSize: 100 });
    expect(items.length).toBeGreaterThan(0);
    for (const p of items) expect(p.oldPrice!).toBeGreaterThan(p.price);
  });

  it("produit inconnu → undefined", () => expect(getProductBySlug("n-existe-pas")).toBeUndefined());
});
