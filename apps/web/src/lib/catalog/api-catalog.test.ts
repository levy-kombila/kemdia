import type { ProductPage } from "@kemdia/contracts";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CACHE_TTL_MS, GATEWAY_RETRY_MS, createApiCatalog } from "./api-catalog";
import { CatalogUnavailableError } from "./port";
import { FAKE_PRODUCTS } from "./test-fake-api";

const KEY = "cle-interne-de-test-".padEnd(40, "x");

type Call = { url: string; init: RequestInit };

/** Faux `fetch` : enregistre les appels et répond comme l'API (ou comme on le lui demande). */
function fakeFetch(respond: (url: string) => Response | Promise<Response>) {
  const calls: Call[] = [];
  const fn = vi.fn((input: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(input), init: init ?? {} });
    return Promise.resolve(respond(String(input)));
  });
  return { fetch: fn as unknown as typeof fetch, calls };
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

function page(): Promise<ProductPage> {
  return Promise.resolve({
    items: FAKE_PRODUCTS.slice(0, 2),
    page: 1,
    pageSize: 2,
    total: FAKE_PRODUCTS.length,
    totalPages: 5,
  });
}

afterEach(() => vi.restoreAllMocks());

describe("Adaptateur « API »", () => {
  it("appelle /api/v1 avec la clé interne, les bons paramètres, sans cache de Next.js", async () => {
    const body = await page();
    const { fetch, calls } = fakeFetch(() => json(body));
    const api = createApiCatalog({ url: "http://api:4000", key: KEY, timeoutMs: 1000, fetch });
    await expect(
      api.products({ category: "high-tech", brands: ["Apple"], inStock: true }),
    ).resolves.toEqual(body);
    expect(calls[0]?.url).toBe(
      "http://api:4000/api/v1/products?category=high-tech&brands=Apple&inStock=1",
    );
    expect(new Headers(calls[0]?.init.headers).get("x-kemdia-internal-key")).toBe(KEY);
    expect(calls[0]?.init.cache).toBe("no-store");
    expect(calls[0]?.init.signal).toBeInstanceOf(AbortSignal);
  });

  it("garde une réponse 60 s et regroupe les demandes simultanées", async () => {
    let time = 0;
    const body = await page();
    const { fetch, calls } = fakeFetch(() => json(body));
    const api = createApiCatalog({
      url: "http://api",
      key: KEY,
      timeoutMs: 1000,
      fetch,
      now: () => time,
    });
    await Promise.all([api.products({}), api.products({}), api.products({})]);
    expect(calls).toHaveLength(1);
    time = CACHE_TTL_MS - 1;
    await api.products({});
    expect(calls).toHaveLength(1);
    time = CACHE_TTL_MS + 1;
    await api.products({});
    expect(calls).toHaveLength(2);
  });

  it("404 → introuvable (page 404 du site)", async () => {
    const { fetch } = fakeFetch(() => json({ status: 404 }, 404));
    const api = createApiCatalog({ url: "http://api", key: KEY, timeoutMs: 1000, fetch });
    await expect(api.product("inconnu")).resolves.toBeNull();
    await expect(api.category("inconnue")).resolves.toBeNull();
  });

  it("adresse invalide : aucune requête n'est envoyée", async () => {
    const { fetch, calls } = fakeFetch(() => json({}));
    const api = createApiCatalog({ url: "http://api", key: KEY, timeoutMs: 1000, fetch });
    await expect(api.product("../../admin")).resolves.toBeNull();
    await expect(api.category("a?b=c")).resolves.toBeNull();
    expect(calls).toHaveLength(0);
  });

  describe("panne de l'API : erreur, jamais de bascule sur le fichier", () => {
    const silence = () => vi.spyOn(console, "error").mockImplementation(() => {});

    it("API injoignable", async () => {
      silence();
      const fetch = vi.fn(() =>
        Promise.reject(new TypeError("fetch failed")),
      ) as unknown as typeof globalThis.fetch;
      const api = createApiCatalog({ url: "http://api", key: KEY, timeoutMs: 1000, fetch });
      await expect(api.categoryTree()).rejects.toBeInstanceOf(CatalogUnavailableError);
    });

    it("délai dépassé", async () => {
      silence();
      const fetch = vi.fn(() =>
        Promise.reject(new DOMException("trop long", "TimeoutError")),
      ) as unknown as typeof globalThis.fetch;
      const api = createApiCatalog({ url: "http://api", key: KEY, timeoutMs: 1000, fetch });
      await expect(api.products({})).rejects.toThrow(/délai dépassé/);
    });

    it("erreur du serveur (500, 429…) : jamais mise en cache", async () => {
      silence();
      let status = 500;
      const body = await page();
      const { fetch, calls } = fakeFetch(() => (status === 200 ? json(body) : json({}, status)));
      const api = createApiCatalog({ url: "http://api", key: KEY, timeoutMs: 1000, fetch });
      await expect(api.products({})).rejects.toThrow(/statut 500/);
      status = 200;
      await expect(api.products({})).resolves.toEqual(body);
      expect(calls).toHaveLength(2);
    });

    it("réponse non conforme au contrat : refusée, sans recopier les valeurs reçues dans le journal", async () => {
      const log = silence();
      const body = await page();
      const broken = { ...body, items: [{ ...body.items[0], price: "gratuit-secret" }] };
      const { fetch } = fakeFetch(() => json(broken));
      const api = createApiCatalog({ url: "http://api", key: KEY, timeoutMs: 1000, fetch });
      await expect(api.products({})).rejects.toThrow(/non conforme/);
      const logged = log.mock.calls.flat().join(" ");
      expect(logged).toContain("items.0.price");
      expect(logged).not.toContain("gratuit-secret");
      expect(logged).not.toContain(KEY);
    });
  });

  describe("démo qui se réveille (S4-T08) : 502/503/504 réessayés jusqu'au délai total", () => {
    const silence = () => vi.spyOn(console, "error").mockImplementation(() => {});
    const tree = { items: [] };

    /** Horloge et attente factices : chaque pause fait avancer l'horloge. */
    function clock() {
      let t = 0;
      return {
        now: () => t,
        sleep: (ms: number) => {
          t += ms;
          return Promise.resolve();
        },
      };
    }

    it("502 puis 503 puis réponse : la page s'affiche, sans erreur", async () => {
      const statuses = [502, 503];
      const { fetch, calls } = fakeFetch(() => {
        const status = statuses.shift();
        return status ? new Response("Bad Gateway", { status }) : json(tree);
      });
      const api = createApiCatalog({
        url: "http://api",
        key: KEY,
        timeoutMs: 90_000,
        fetch,
        retryGatewayErrors: true,
        ...clock(),
      });
      await expect(api.categoryTree()).resolves.toEqual([]);
      expect(calls).toHaveLength(3);
    });

    it("jamais au-delà du délai total : erreur à la fin", async () => {
      silence();
      const { fetch, calls } = fakeFetch(() => new Response("", { status: 502 }));
      const api = createApiCatalog({
        url: "http://api",
        key: KEY,
        timeoutMs: 10_000,
        fetch,
        retryGatewayErrors: true,
        ...clock(),
      });
      await expect(api.categoryTree()).rejects.toBeInstanceOf(CatalogUnavailableError);
      // Essais à 0, 3, 6 s ; à 9 s, il ne reste pas 3 s : on arrête
      expect(calls).toHaveLength(Math.ceil(10_000 / GATEWAY_RETRY_MS));
    });

    it("hors démo, ou pour une autre erreur (500) : pas de nouvel essai", async () => {
      silence();
      for (const [status, retry] of [
        [502, false],
        [500, true],
      ] as const) {
        const { fetch, calls } = fakeFetch(() => new Response("", { status }));
        const api = createApiCatalog({
          url: "http://api",
          key: KEY,
          timeoutMs: 90_000,
          fetch,
          retryGatewayErrors: retry,
          ...clock(),
        });
        await expect(api.categoryTree()).rejects.toBeInstanceOf(CatalogUnavailableError);
        expect(calls).toHaveLength(1);
      }
    });
  });
});
