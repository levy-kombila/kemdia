import { beforeEach, describe, expect, it } from "vitest";
import { createCategory } from "../domain/category.js";
import { Product } from "../domain/product.js";
import { InMemoryCategories, InMemoryProducts } from "../../../../test/catalog/in-memory.js";
import { ids, productProps, variantProps } from "../../../../test/catalog/fixtures.js";
import {
  CATEGORY_CACHE_MS,
  CORRECTION_BUDGET_PER_MINUTE,
  CORRECTION_CACHE_MS,
  CatalogService,
  MAX_AVAILABILITY_LINES,
} from "./catalog.service.js";
import type { SharedCounters } from "./ports.js";

/** Compteurs partagés (S8-T07) : fenêtre fixe, en mémoire. */
class FixedWindowCounters implements SharedCounters {
  private readonly entries = new Map<string, { hits: number; resetAt: Date }>();
  hit(key: string, windowMs: number, now: Date) {
    const entry = this.entries.get(key);
    const next =
      entry && entry.resetAt > now
        ? { hits: entry.hits + 1, resetAt: entry.resetAt }
        : { hits: 1, resetAt: new Date(now.getTime() + windowMs) };
    this.entries.set(key, next);
    return Promise.resolve(next);
  }
  read(key: string, now: Date) {
    const entry = this.entries.get(key);
    return Promise.resolve(entry && entry.resetAt > now ? entry : null);
  }
  undo() {
    return Promise.resolve();
  }
}

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
    service = new CatalogService(categories, products, new FixedWindowCounters());
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

  it("fiche produit : seulement les fiches publiées avec une offre visible", async () => {
    expect((await service.getListing("telephone-kemdia"))?.content.id).toBe(ids.product);
    expect(await service.getListing("brouillon")).toBeNull();
    expect(await service.getListing("../INVALIDE")).toBeNull();
  });

  describe("fiche commune et offres (S7.5-T02)", () => {
    const shopA = "aaaaaaaa-0000-4000-8000-000000000001";
    const shopB = "bbbbbbbb-0000-4000-8000-000000000002";
    // Deux boutiques vendent la même déclinaison (ids.v1) de la fiche « telephone-kemdia »
    const offer = (id: string, shopId: string, variant: Parameters<typeof variantProps>[0]) =>
      Product.create(
        productProps({
          id,
          slug: `offre-${id.slice(0, 4)}`,
          shopId,
          listingId: ids.product,
          listingSlug: "telephone-kemdia",
          variants: [variantProps({ listingVariantId: ids.v1, ...variant })],
        }),
      );

    beforeEach(() => {
      products.items = [
        offer("c1000000-0000-4000-8000-000000000001", shopA, {
          id: "c1000000-0000-4000-8000-0000000000a1",
          sku: "A-1",
          price: 140_000,
          stock: 0,
        }),
        offer("c2000000-0000-4000-8000-000000000002", shopB, {
          id: "c2000000-0000-4000-8000-0000000000b1",
          sku: "B-1",
          price: 150_000,
          stock: 3,
        }),
      ];
      products.sellers.set(shopA, { name: "Boutique A", slug: "boutique-a", city: "Libreville" });
      products.sellers.set(shopB, { name: "Boutique B", slug: "boutique-b", city: "Port-Gentil" });
    });

    it("une seule fiche, toutes les offres ; mise en avant : en stock d'abord, même plus chère", async () => {
      const view = await service.getListing("telephone-kemdia");
      expect(view?.offers.map((o) => o.seller?.name)).toEqual(["Boutique B", "Boutique A"]);
      expect(view?.main.variant.sku).toBe("B-1");
      expect(view?.choices).toHaveLength(1);
      expect(view?.totalStock).toBe(3);
    });

    it("à prix égal et en stock : la boutique de la ville du client", async () => {
      products.items = products.items.map((p) =>
        Product.create({
          ...productProps(),
          id: p.id,
          slug: p.slug,
          shopId: p.shopId,
          listingId: p.listingId,
          listingSlug: p.listingSlug,
          variants: p.variants.map((v) => ({ ...v, price: 150_000, stock: 2 })),
        }),
      );
      expect((await service.getListing("telephone-kemdia", "port-gentil"))?.main.seller?.name).toBe(
        "Boutique B",
      );
      expect((await service.getListing("telephone-kemdia", "Libreville"))?.main.seller?.name).toBe(
        "Boutique A",
      );
      // Ville illisible : ignorée (identifiant de l'offre pour départager)
      expect((await service.getListing("telephone-kemdia", "<script>"))?.main.seller?.name).toBe(
        "Boutique A",
      );
    });

    it("une offre cachée (boutique suspendue, fiche retirée) n'est jamais montrée", async () => {
      products.items = products.items.map((p) =>
        p.shopId === shopB
          ? Product.create({
              ...productProps(),
              ...p,
              variants: [...p.variants],
              shopSuspended: true,
            })
          : p,
      );
      const view = await service.getListing("telephone-kemdia");
      expect(view?.offers.map((o) => o.seller?.name)).toEqual(["Boutique A"]);
      products.items = products.items.map((p) =>
        Product.create({
          ...productProps(),
          ...p,
          variants: [...p.variants],
          listingPublished: false,
        }),
      );
      expect(await service.getListing("telephone-kemdia")).toBeNull();
    });

    it("doublon fusionné : son adresse mène à la fiche qui le remplace", async () => {
      products.items.push(
        Product.create(
          productProps({
            id: "d1000000-0000-4000-8000-000000000001",
            slug: "doublon",
            listingPublished: false,
            variants: [variantProps({ id: "d1000000-0000-4000-8000-0000000000d1", sku: "D-1" })],
          }),
        ),
      );
      products.mergedInto.set("doublon", "telephone-kemdia");
      expect((await service.getListing("doublon"))?.content.slug).toBe("telephone-kemdia");
    });
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

  it("S7.5-T06 : corrige les mots qui ne trouvent rien, sauf en recherche exacte", async () => {
    await service.searchProducts({ q: "Télpehone" });
    expect(products.lastCriteria?.terms).toEqual(["telephone"]);
    const result = await service.searchProducts({ q: "telpehone kemdia" });
    expect(result.correctedQuery).toBe("telephone kemdia");
    await service.searchProducts({ q: "telpehone", exact: "1" });
    expect(products.lastCriteria?.terms).toEqual(["telpehone"]);
    // Mots qui trouvent déjà quelque chose : inchangés, pas de correctedQuery
    expect((await service.searchProducts({ q: "telephone" })).correctedQuery).toBeUndefined();
    // Un mot sans remplaçant assez proche : aucune correction
    expect(
      (await service.searchProducts({ q: "telpehone xqzwvk" })).correctedQuery,
    ).toBeUndefined();
    await service.getFacets({ q: "telpehone" });
    expect(products.lastCriteria?.terms).toEqual(["telephone"]);
  });

  it("S7.5-T06 : suggestions (rayons, marques), rien sous 2 lettres", async () => {
    const s = await service.suggest("tele");
    expect(s.categories.map((c) => c.slug)).toEqual(["telephones"]);
    expect(s.brands).toEqual([]);
    expect((await service.suggest("kemd")).brands).toEqual(["Kemdia"]);
    expect((await service.suggest("kemdai")).correctedQuery).toBe("kemdia");
    expect(await service.suggest("t")).toEqual({
      products: [],
      categories: [],
      brands: [],
      shops: [],
    });
    expect(await service.suggest(42)).toEqual({
      products: [],
      categories: [],
      brands: [],
      shops: [],
    });
  });

  it("S8-T05 : boutiques cherchées sur les mots tapés, puis sur les mots corrigés", async () => {
    const asked: string[][] = [];
    const shops = {
      list: () => Promise.reject(new Error("inutile")),
      findActiveBySlug: () => Promise.resolve(null),
      suggest: (terms: readonly string[], limit: number) => {
        asked.push([...terms, String(limit)]);
        return Promise.resolve(
          terms.includes("mbolo")
            ? [{ slug: "mbolo", name: "Mbolo", city: "Libreville", official: false }]
            : [],
        );
      },
    };
    const withShops = new CatalogService(categories, products, new FixedWindowCounters(), shops);
    // Aucun produit ne contient « mbolo » : la correction ne doit pas empêcher de trouver la boutique
    expect((await withShops.suggest("Mbolo")).shops.map((s) => s.slug)).toEqual(["mbolo"]);
    expect(asked[0]).toEqual(["mbolo", "2"]);
    // Faute de frappe sur un mot du catalogue : mots tapés d'abord, puis mots corrigés
    asked.length = 0;
    expect((await withShops.suggest("kemdai")).shops).toEqual([]);
    expect(asked).toEqual([
      ["kemdai", "2"],
      ["kemdia", "2"],
    ]);
    // Sans annuaire (tests) : aucune boutique
    expect((await service.suggest("mbolo")).shops).toEqual([]);
  });

  it("S7.5-T06 : correction gardée 30 s et budget commun par minute (relecture de sécurité)", async () => {
    let time = 0;
    service.clock = () => time;
    await service.searchProducts({ q: "telpehone" });
    await service.getFacets({ q: "telpehone" });
    expect(products.similarWordsCalls).toBe(1);
    time = CORRECTION_CACHE_MS + 1;
    await service.searchProducts({ q: "telpehone" });
    expect(products.similarWordsCalls).toBe(2);
    // Budget épuisé : recherche telle quelle, sans appel à la base
    for (let i = 0; i < CORRECTION_BUDGET_PER_MINUTE; i++)
      await service.searchProducts({ q: `telpehone x${i}` });
    const calls = products.similarWordsCalls;
    const over = await service.searchProducts({ q: "kemdai" });
    expect(over.correctedQuery).toBeUndefined();
    expect(products.similarWordsCalls).toBe(calls);
    time += 60_000;
    expect((await service.searchProducts({ q: "kemdai" })).correctedQuery).toBe("kemdia");
  });
});
