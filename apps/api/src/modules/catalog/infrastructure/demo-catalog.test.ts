import { demoCatalog, uuidV5, type DemoCatalog } from "@kemdia/contracts/demo";
import { describe, expect, it } from "vitest";
import { InMemoryCategories, InMemoryProducts } from "../../../../test/catalog/in-memory.js";
import { CategoryTree } from "../domain/category.js";
import { importCatalog, prepareDemoCatalog } from "./demo-catalog.js";

const data: DemoCatalog = demoCatalog;

describe("Catalogue de démonstration", () => {
  it("UUID v5 conforme à la norme (exemple de la RFC 9562)", () => {
    expect(uuidV5("www.example.com", "6ba7b810-9dad-11d1-80b4-00c04fd430c8")).toBe(
      "2ed6657d-e927-568b-95e1-2665a8aea6a2",
    );
  });

  it("toutes les données respectent les règles du domaine", () => {
    const prepared = prepareDemoCatalog(data);
    expect(prepared.categories).toHaveLength(112);
    expect(prepared.products).toHaveLength(50);
    expect(prepared.products.every(({ product }) => product.variants.length === 1)).toBe(true);
  });

  it("BR-005 : 3 niveaux au plus ; Fitness rangé sous Sport & Loisirs avec ses 7 produits", () => {
    const { categories, products } = prepareDemoCatalog(data);
    const tree = new CategoryTree(categories);
    const depth = (id: string) => tree.path(id).length;
    expect(Math.max(...categories.map((c) => depth(c.id)))).toBe(3);
    const fitness = tree.bySlugOrNull("sport-fitness");
    expect(tree.path(fitness?.id ?? "").map((c) => c.name)).toEqual(["Sport & Loisirs", "Fitness"]);
    expect(tree.children(fitness?.id ?? "").map((c) => c.name)).toEqual([
      "Musculation",
      "Yoga",
      "Cardio",
      "Accessoires fitness",
    ]);
    const inFitness = new Set(tree.descendantIds(fitness?.id ?? ""));
    expect(products.filter(({ product }) => inFitness.has(product.categoryId))).toHaveLength(7);
  });

  it("identifiants stables d'une exécution à l'autre (import relançable)", () => {
    const a = prepareDemoCatalog(data);
    const b = prepareDemoCatalog(data);
    expect(a.products.map((p) => p.product.id)).toEqual(b.products.map((p) => p.product.id));
    expect(a.categories[0]?.id).toBe(uuidV5(`categorie:${data.categories[0]?.slug}`));
  });

  it("reprend prix, ancien prix, stock et couleur dans la variante", () => {
    const source = data.products.find((p) => p.oldPrice !== null && p.color);
    const { product } = prepareDemoCatalog(data).products.find(
      ({ product }) => product.slug === source?.slug,
    ) ?? { product: undefined };
    expect(product?.price).toBe(source?.price);
    expect(product?.compareAtPrice).toBe(source?.oldPrice);
    expect(product?.totalStock).toBe(source?.stock);
    expect(product?.variants[0]?.attributes).toEqual({ couleur: source?.color });
  });

  it("écrit les catégories parentes avant leurs enfants", async () => {
    const categories = new InMemoryCategories();
    const order: string[] = [];
    const save = categories.save.bind(categories);
    categories.save = (c) => {
      if (c.parentId) expect(order).toContain(c.parentId);
      order.push(c.id);
      return save(c);
    };
    const result = await importCatalog(prepareDemoCatalog(data), {
      categories,
      products: new InMemoryProducts(),
    });
    expect(result).toEqual({ categories: 112, products: 50 });
  });

  it("refuse des données invalides avant d'écrire quoi que ce soit", () => {
    const broken = structuredClone(data);
    (broken.products[0] as { price: number }).price = -5;
    expect(() => prepareDemoCatalog(broken)).toThrow(/prix/);
  });
});
