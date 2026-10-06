import type { ProductPage } from "@kemdia/contracts";
import { createFileCatalog } from "./file-catalog";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CACHE_TTL_MS, createApiCatalog } from "./api-catalog";
import { CatalogUnavailableError } from "./port";

const KEY = "cle-interne-de-test-".padEnd(40, "x");
const file = createFileCatalog();

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

async function page(): Promise<ProductPage> {
  return file.products({ pageSize: 2 });
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
});
