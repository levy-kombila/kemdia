import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FAKE_PRODUCTS, fakeApiResponse } from "./test-fake-api";

/**
 * Point d'entrée du catalogue : choix de l'adaptateur au démarrage, rendu à la demande,
 * garde de construction et fonctions des pages. `connection()` de Next.js est simulée.
 */
const connection = vi.fn(() => Promise.resolve());
vi.mock("next/server", () => ({ connection }));

const KEY = "k".repeat(40);
const API = "http://api.invalid:4000";

async function load(env: Record<string, string | undefined>) {
  vi.resetModules();
  for (const [name, value] of Object.entries(env)) vi.stubEnv(name, value as string);
  return import("./index");
}

beforeEach(() => {
  connection.mockClear();
  vi.stubEnv("API_URL", "");
  vi.stubEnv("API_INTERNAL_KEY", "");
  vi.stubEnv("APP_ENV", "local");
  vi.stubEnv("NEXT_PHASE", "");
  vi.stubEnv("CATALOG_TIMEOUT_MS", "");
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("catalogue des pages", () => {
  it("chaque lecture passe par connection() : la page est rendue à la demande", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn((url: string) => Promise.resolve(fakeApiResponse(url))),
    );
    const catalog = await load({ API_URL: API, API_INTERNAL_KEY: KEY });
    await catalog.getCategoryTree();
    await catalog.getProduct("inconnu");
    expect(connection).toHaveBeenCalledTimes(2);
  });

  it("garde : une lecture pendant `next build` fait échouer la construction", async () => {
    const catalog = await load({ NEXT_PHASE: "phase-production-build" });
    await expect(catalog.getCategoryTree()).rejects.toThrow(catalog.BUILD_READ_ERROR);
  });

  it("API_URL définie : l'API seule — si elle tombe, erreur (pas de catalogue de secours)", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const fetch = vi.fn<(url: string) => Promise<Response>>(() =>
      Promise.reject(new TypeError("fetch failed")),
    );
    vi.stubGlobal("fetch", fetch);
    const catalog = await load({ API_URL: API, API_INTERNAL_KEY: KEY });
    await expect(catalog.getCategoryTree()).rejects.toBeInstanceOf(catalog.CatalogUnavailableError);
    expect(fetch).toHaveBeenCalledOnce();
    expect(String(fetch.mock.calls[0]?.[0])).toBe(`${API}/api/v1/categories`);
  });

  it("sans API_URL : aucune lecture possible, quel que soit l'environnement", async () => {
    for (const APP_ENV of ["local", "demo", "production"]) {
      const catalog = await load({ APP_ENV, API_INTERNAL_KEY: KEY });
      await expect(catalog.getCategoryTree()).rejects.toThrow(/API_URL : obligatoire/);
    }
  });

  describe("fonctions des pages (fausse API)", () => {
    async function withFakeApi() {
      const fetch = vi.fn((url: string) => Promise.resolve(fakeApiResponse(url)));
      vi.stubGlobal("fetch", fetch);
      const catalog = await load({ API_URL: API, API_INTERNAL_KEY: KEY });
      const urls = () => fetch.mock.calls.map(([url]) => String(url).replace(API, ""));
      return { catalog, urls };
    }

    it("sélections de l'accueil : bons paramètres envoyés à l'API", async () => {
      const { catalog, urls } = await withFakeApi();
      expect((await catalog.getBestsellers(5)).every((p) => p.isBestseller)).toBe(true);
      expect((await catalog.getFeaturedProducts(4)).every((p) => p.isFeatured)).toBe(true);
      expect((await catalog.getNewProducts(4)).every((p) => p.isNew)).toBe(true);
      expect((await catalog.getDeals(4)).every((p) => p.compareAtPrice !== null)).toBe(true);
      expect(urls()).toEqual([
        "/api/v1/products?sort=ventes&pageSize=5&badge=bestseller",
        "/api/v1/products?pageSize=4&badge=featured",
        "/api/v1/products?sort=nouveautes&pageSize=4&badge=new",
        "/api/v1/products?pageSize=4&scope=promotions",
      ]);
    });

    it("ronds (sous-catégories ayant des produits), tuiles (4 produits exactement), compteurs", async () => {
      const { catalog } = await withFakeApi();
      const highlights = await catalog.getCategoryHighlights(6);
      expect(highlights.map((h) => [h.category.slug, h.count])).toEqual([
        ["telephones", 5],
        ["chaussures", 4],
      ]);
      expect(highlights.every((h) => h.image.startsWith("/images/"))).toBe(true);
      // High-Tech a 5 produits (tuile de 4) ; Mode en a 4 (tuile de 4)
      const tiles = await catalog.getCategoryTiles();
      expect(tiles.map((t) => [t.category.slug, t.products.length])).toEqual([
        ["high-tech", 4],
        ["mode", 4],
      ]);
      expect(await catalog.countProducts("mode")).toBe(4);
      const facets = await catalog.getListingFacets({ scope: "promotions" });
      expect(facets.prices.map((p) => p.label)).toContain("Moins de 50 000 FCFA");
    });

    it("produits similaires (même grand rayon, sans le produit affiché) et plan du site paginé", async () => {
      const { catalog } = await withFakeApi();
      const product = await catalog.getProduct("produit-1");
      const related = await catalog.getRelatedProducts(product!, 3);
      expect(related.map((p) => p.slug)).toEqual(["produit-2", "produit-3", "produit-4"]);
      const sitemap = await catalog.getSitemapSlugs();
      expect(sitemap.categories).toEqual(["high-tech", "telephones", "mode", "chaussures"]);
      expect(sitemap.products).toHaveLength(FAKE_PRODUCTS.length);
    });
  });
});
