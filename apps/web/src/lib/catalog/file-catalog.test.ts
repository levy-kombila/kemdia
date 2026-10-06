import {
  CategoryTreeSchema,
  CategoryViewSchema,
  FacetsSchema,
  ProductDetailSchema,
  ProductPageSchema,
} from "@kemdia/contracts";
import { demoCatalog, demoIds } from "@kemdia/contracts/demo";
import { describe, expect, it } from "vitest";
import { createFileCatalog, searchable } from "./file-catalog";

const catalog = createFileCatalog();
const data = demoCatalog.products;
const all = { pageSize: 48 } as const;

describe("Adaptateur « fichier » : mêmes réponses que l'API", () => {
  it("chaque réponse respecte le contrat partagé avec l'API", async () => {
    CategoryTreeSchema.parse({ items: await catalog.categoryTree() });
    CategoryViewSchema.parse(await catalog.category("high-tech"));
    ProductPageSchema.parse(await catalog.products(all));
    FacetsSchema.parse(await catalog.facets({}));
    for (const p of data) ProductDetailSchema.parse(await catalog.product(p.slug));
  });

  it("mêmes identifiants que ceux importés dans la base de l'API (UUID v5)", async () => {
    const product = await catalog.product(data[0]!.slug);
    expect(product?.id).toBe(demoIds.product(data[0]!.slug));
    expect(product?.variantId).toBe(demoIds.variant(data[0]!.slug));
    expect(product?.variants[0]?.sku).toBe(demoIds.sku(data[0]!.slug));
    expect((await catalog.categoryTree())[0]?.id).toBe(demoIds.category("high-tech"));
  });

  it("arborescence : 5 rayons, 3 niveaux au plus (BR-005), fil d'Ariane", async () => {
    const tree = await catalog.categoryTree();
    expect(tree.map((r) => r.slug)).toEqual(
      expect.arrayContaining([
        "high-tech",
        "mode",
        "maison-cuisine",
        "beaute-sante",
        "sport-loisirs",
      ]),
    );
    const depth = (nodes: typeof tree): number =>
      nodes.length ? 1 + Math.max(...nodes.map((n) => depth(n.children))) : 0;
    expect(depth(tree)).toBe(3);
    expect((await catalog.category("fitness-yoga"))?.path.map((c) => c.slug)).toEqual([
      "sport-loisirs",
      "sport-fitness",
      "fitness-yoga",
    ]);
    expect(await catalog.category("inconnue")).toBeNull();
  });

  it("une catégorie inclut ses sous-catégories ; catégorie inconnue → liste vide", async () => {
    const fitness = await catalog.products({ category: "sport-fitness", ...all });
    expect(fitness.total).toBe(7);
    expect(await catalog.products({ category: "inconnue" })).toMatchObject({ items: [], total: 0 });
  });

  it("recherche mot par mot, sans accents ni ponctuation", async () => {
    const accents = await catalog.products({ q: "ÉCOUTEURS", ...all });
    const plain = await catalog.products({ q: "ecouteurs", ...all });
    expect(accents.total).toBeGreaterThan(0);
    expect(accents.items.map((p) => p.id)).toEqual(plain.items.map((p) => p.id));
    expect(searchable("%' OR 1=1 --")).toBe("or 1 1");
  });

  it("filtres, sélections et page Promotions", async () => {
    const count = async (query: Parameters<typeof catalog.products>[0]) =>
      (await catalog.products({ ...query, ...all })).total;
    expect(await count({ inStock: true })).toBe(data.filter((p) => p.stock > 0).length);
    expect(await count({ onlyDeals: true })).toBe(data.filter((p) => p.oldPrice !== null).length);
    expect(await count({ scope: "promotions" })).toBe(
      data.filter((p) => p.oldPrice !== null).length,
    );
    expect(await count({ minRating: 4 })).toBe(data.filter((p) => p.rating >= 4).length);
    expect(await count({ brands: ["Apple"] })).toBe(data.filter((p) => p.brand === "Apple").length);
    expect(await count({ priceMin: 50_000, priceMax: 150_000 })).toBe(
      data.filter((p) => p.price >= 50_000 && p.price <= 150_000).length,
    );
    expect(await count({ badge: "bestseller" })).toBe(data.filter((p) => p.isBestseller).length);
  });

  it("tris et pagination sans doublon ni oubli", async () => {
    for (const sort of [
      "pertinence",
      "nouveautes",
      "prix-asc",
      "prix-desc",
      "note",
      "ventes",
    ] as const) {
      const ids = new Set<string>();
      for (let page = 1; page <= 3; page++) {
        (await catalog.products({ sort, page, pageSize: 20 })).items.forEach((p) => ids.add(p.id));
      }
      expect(ids.size, sort).toBe(50);
    }
    const sold = (await catalog.products({ sort: "ventes", ...all })).items.map(
      (p) => p.reviewCount,
    );
    expect(sold).toEqual([...sold].sort((a, b) => b - a));
    expect((await catalog.products({ page: 99, pageSize: 20 })).page).toBe(3);
  });

  it("compteurs calculés avant les filtres de la colonne de gauche", async () => {
    const facets = await catalog.facets({ category: "high-tech" });
    const base = (await catalog.products({ category: "high-tech", ...all })).items;
    expect(facets.inStock).toBe(base.filter((p) => p.inStock).length);
    expect(facets.prices.reduce((sum, p) => sum + p.count, 0)).toBe(base.length);
  });

  it("fiche : une variante, la couleur en caractéristique ; produit inconnu → null", async () => {
    const source = data.find((p) => p.color)!;
    const product = await catalog.product(source.slug);
    expect(product?.variants).toEqual([
      expect.objectContaining({
        name: source.color,
        attributes: { couleur: source.color },
        stock: source.stock,
      }),
    ]);
    expect(await catalog.product("inconnu")).toBeNull();
  });
});
