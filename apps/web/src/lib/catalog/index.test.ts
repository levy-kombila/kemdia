import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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
    const catalog = await load({});
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

  it("APP_ENV=production sans API_URL : aucune lecture possible", async () => {
    const catalog = await load({ APP_ENV: "production" });
    await expect(catalog.getCategoryTree()).rejects.toThrow(/API_URL : obligatoire en production/);
  });

  describe("fonctions des pages (mode fichier)", () => {
    it("sélections de l'accueil", async () => {
      const catalog = await load({});
      const best = await catalog.getBestsellers(5);
      expect(best).toHaveLength(5);
      expect(best.every((p) => p.isBestseller)).toBe(true);
      expect(best.map((p) => p.reviewCount)).toEqual(
        [...best].map((p) => p.reviewCount).sort((a, b) => b - a),
      );
      expect((await catalog.getFeaturedProducts(4)).every((p) => p.isFeatured)).toBe(true);
      expect((await catalog.getNewProducts(4)).every((p) => p.isNew)).toBe(true);
      expect((await catalog.getDeals(4)).every((p) => p.compareAtPrice !== null)).toBe(true);
    });

    it("ronds, tuiles et compteurs", async () => {
      const catalog = await load({});
      const highlights = await catalog.getCategoryHighlights(6);
      expect(highlights).toHaveLength(6);
      expect(highlights.every((h) => h.count > 0 && h.image.startsWith("/images/"))).toBe(true);
      expect((await catalog.getCategoryTiles()).every((t) => t.products.length === 4)).toBe(true);
      expect(await catalog.countProducts("sport-fitness")).toBe(7);
      const facets = await catalog.getListingFacets({ scope: "promotions" });
      expect(facets.prices.map((p) => p.label)).toContain("Moins de 50 000 FCFA");
    });

    it("produits similaires et plan du site", async () => {
      const catalog = await load({});
      const product = await catalog.getProduct("apple-google-pixel-modern-blanc");
      const related = await catalog.getRelatedProducts(product!, 4);
      expect(related.length).toBeGreaterThan(0);
      expect(related.some((p) => p.id === product!.id)).toBe(false);
      const sitemap = await catalog.getSitemapSlugs();
      expect(sitemap.categories).toHaveLength(112);
      expect(new Set(sitemap.products).size).toBe(50);
    });
  });
});
