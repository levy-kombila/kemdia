import { beforeEach, describe, expect, it } from "vitest";
import { createCategory } from "../domain/category.js";
import { Product } from "../domain/product.js";
import { InMemoryCategories, InMemoryProducts } from "../../../../test/catalog/in-memory.js";
import { ids, productProps, variantProps } from "../../../../test/catalog/fixtures.js";
import { CATEGORY_CACHE_MS, CatalogService, MAX_AVAILABILITY_LINES } from "./catalog.service.js";

const category = (id: string, slug: string, parentId: string | null) =>
  createCategory({ id, slug, name: slug, parentId, icon: "tag", image: null, position: 0 });

const root = category(ids.category, "high-tech", null);
const phones = category("4f5a6b7c-8d9e-4f0a-8b2c-3d4e5f6a7b8c", "telephones", root.id);

describe("CatalogService", () => {
  let categories: InMemoryCategories;
  let products: InMemoryProducts;
  let service: CatalogService;

  beforeEach(() => {
    categories = new InMemoryCategories([root, phones]);
    products = new InMemoryProducts([
      Product.create(productProps()),
      Product.create(
        productProps({
          id: "5a6b7c8d-9e0f-4a1b-8c3d-4e5f6a7b8c9d",
          slug: "brouillon",
          status: "DRAFT",
          variants: [variantProps({ id: ids.v2, sku: "KMD-DRAFT" })],
        }),
      ),
    ]);
    service = new CatalogService(categories, products);
  });

  it("catégorie : fil d'Ariane et sous-catégories", async () => {
    const view = await service.getCategory("high-tech");
    expect(view?.path.map((c) => c.slug)).toEqual(["high-tech"]);
    expect(view?.children.map((c) => c.slug)).toEqual(["telephones"]);
    expect(await service.getCategory("inconnue")).toBeNull();
  });

  it("garde l'arborescence en mémoire pendant une minute", async () => {
    let time = 0;
    service.clock = () => time;
    await service.getCategoryRoots();
    await service.getCategoryRoots();
    expect(categories.calls).toBe(1);
    time = CATEGORY_CACHE_MS + 1;
    await service.getCategoryRoots();
    expect(categories.calls).toBe(2);
    service.invalidateCategories();
    await service.getCategoryRoots();
    expect(categories.calls).toBe(3);
  });

  it("fiche produit : seulement les produits publiés", async () => {
    expect((await service.getProduct("telephone-kemdia"))?.id).toBe(ids.product);
    expect(await service.getProduct("brouillon")).toBeNull();
    expect(await service.getProduct("../INVALIDE")).toBeNull();
  });

  it("recherche dans une catégorie : inclut ses sous-catégories", async () => {
    await service.searchProducts({ categorySlug: "high-tech", q: "Téléphone" });
    expect(products.lastCriteria?.categoryIds?.slice().sort()).toEqual([root.id, phones.id].sort());
    expect(products.lastCriteria?.terms).toEqual(["telephone"]);
  });

  it("catégorie inconnue : liste vide, sans interroger les produits", async () => {
    products.lastCriteria = undefined;
    const page = await service.searchProducts({ categorySlug: "inexistante" });
    expect(page).toMatchObject({ items: [], total: 0, totalPages: 1 });
    expect(products.lastCriteria).toBeUndefined();
  });

  it("compteurs des filtres : calculés sans appliquer les filtres", async () => {
    await service.getFacets({ q: "kemdia", brands: "Apple", inStock: "1", priceMin: 1 }, [
      { key: "bas", min: 0, max: 50_000 },
    ]);
    expect(products.lastCriteria).toEqual({
      terms: ["kemdia"],
      brands: [],
      inStock: false,
      onlyDeals: false,
    });
  });

  it("page Promotions : liste et compteurs limités aux promotions", async () => {
    await service.searchProducts({ scope: "promotions" });
    expect(products.lastCriteria?.onlyDeals).toBe(true);
    await service.getFacets({ scope: "promotions", onlyDeals: "0" });
    expect(products.lastCriteria?.onlyDeals).toBe(true);
  });

  it("compteurs : tranches de prix du site par défaut", async () => {
    const facets = await service.getFacets({});
    expect(facets.prices.map((p) => p.key)).toEqual([
      "moins-50000",
      "50000-150000",
      "150000-300000",
      "plus-300000",
    ]);
  });

  it("fil d'Ariane d'une catégorie", async () => {
    expect((await service.categoryPath(phones.id)).map((c) => c.slug)).toEqual([
      "high-tech",
      "telephones",
    ]);
    expect(await service.categoryPath("inconnue")).toEqual([]);
  });

  it("BR-001 : disponibilité ligne par ligne", async () => {
    const result = await service.checkAvailability([
      { variantId: ids.v1, quantity: 2 },
      { variantId: ids.v1, quantity: 6 },
      { variantId: ids.v2, quantity: 1 },
      { variantId: "pas-un-uuid", quantity: 1 },
    ]);
    expect(result).toEqual([
      { variantId: ids.v1, quantity: 2, ok: true },
      { variantId: ids.v1, quantity: 6, ok: false, reason: "STOCK_INSUFFISANT", available: 5 },
      { variantId: ids.v2, quantity: 1, ok: false, reason: "PRODUIT_INDISPONIBLE" },
      { variantId: "pas-un-uuid", quantity: 1, ok: false, reason: "VARIANTE_INCONNUE" },
    ]);
  });

  it("BR-001 : refuse une vérification démesurée", async () => {
    const lines = Array.from({ length: MAX_AVAILABILITY_LINES + 1 }, () => ({
      variantId: ids.v1,
      quantity: 1,
    }));
    await expect(service.checkAvailability(lines)).rejects.toThrow(RangeError);
  });
});
