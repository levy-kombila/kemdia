import { describe, expect, it, vi } from "vitest";
import type { CatalogSource } from "./catalog-source";
import { wakeCatalogApi } from "./wake-api";

const API: CatalogSource = {
  kind: "api",
  url: "https://kemdia-api.onrender.com",
  key: "k".repeat(40),
  timeoutMs: 60_000,
};

describe("Réveil de l'API au démarrage du site (démo Render, S3-T07)", () => {
  it("démo + API : appelle /api/health, sans la clé interne", async () => {
    const fetch = vi.fn(() => Promise.resolve(new Response("{}", { status: 200 })));
    const log = vi.fn();
    await expect(wakeCatalogApi("demo", API, { fetch, log })).resolves.toBe("awake");
    expect(fetch).toHaveBeenCalledOnce();
    const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://kemdia-api.onrender.com/api/health");
    expect(JSON.stringify(init)).not.toContain("k".repeat(40));
    expect(log).toHaveBeenCalledWith(expect.stringMatching(/prête en/));
  });

  it("rien hors démo, ni en mode fichier", async () => {
    const fetch = vi.fn();
    for (const env of [undefined, "local", "staging", "production"]) {
      await expect(wakeCatalogApi(env, API, { fetch })).resolves.toBe("skipped");
    }
    await expect(wakeCatalogApi("demo", { kind: "file" }, { fetch })).resolves.toBe("skipped");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("API muette ou en erreur : simple ligne de journal, jamais d'exception", async () => {
    const log = vi.fn();
    const down = vi.fn(() => Promise.reject(new TypeError("fetch failed")));
    await expect(wakeCatalogApi("demo", API, { fetch: down, log })).resolves.toBe("failed");
    const error = vi.fn(() => Promise.resolve(new Response("", { status: 503 })));
    await expect(wakeCatalogApi("demo", API, { fetch: error, log })).resolves.toBe("failed");
    expect(log.mock.calls.flat().join("\n")).toMatch(/pas de réponse[\s\S]*réponse 503/);
  });
});
