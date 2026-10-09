import { describe, expect, it, vi } from "vitest";
import type { CatalogSource } from "./catalog-source";
import { wakeCatalogApi } from "./wake-api";

const API: CatalogSource = {
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

  it("rien hors démo", async () => {
    const fetch = vi.fn();
    for (const env of [undefined, "local", "staging", "production"]) {
      await expect(wakeCatalogApi(env, API, { fetch })).resolves.toBe("skipped");
    }
    expect(fetch).not.toHaveBeenCalled();
  });

  it("API muette ou en erreur : simple ligne de journal, jamais d'exception", async () => {
    const log = vi.fn();
    const down = vi.fn(() => Promise.reject(new TypeError("fetch failed")));
    await expect(wakeCatalogApi("demo", API, { fetch: down, log })).resolves.toBe("failed");
    const error = vi.fn(() => Promise.resolve(new Response("", { status: 500 })));
    await expect(wakeCatalogApi("demo", API, { fetch: error, log })).resolves.toBe("failed");
    expect(error).toHaveBeenCalledOnce();
    expect(log.mock.calls.flat().join("\n")).toMatch(/pas de réponse[\s\S]*réponse 500/);
  });

  it("502 pendant le démarrage (Render) : réessaie toutes les 3 s jusqu'à 90 s (S4-T08)", async () => {
    let t = 0;
    const timing = { now: () => t, sleep: (ms: number) => ((t += ms), Promise.resolve()) };
    const log = vi.fn();
    const statuses = [502, 502, 503];
    const waking = vi.fn(() =>
      Promise.resolve(new Response("{}", { status: statuses.shift() ?? 200 })),
    );
    await expect(wakeCatalogApi("demo", API, { fetch: waking, log, ...timing })).resolves.toBe(
      "awake",
    );
    expect(waking).toHaveBeenCalledTimes(4);
    expect(log).toHaveBeenCalledWith("Kemdia — réveil de l'API : prête en 9.0 s");

    t = 0;
    const stuck = vi.fn(() => Promise.resolve(new Response("", { status: 502 })));
    await expect(wakeCatalogApi("demo", API, { fetch: stuck, log, ...timing })).resolves.toBe(
      "failed",
    );
    expect(stuck).toHaveBeenCalledTimes(30);

    // Délai dépassé pendant les essais : « failed », jamais d'exception
    t = 0;
    const statuses2 = [502];
    const timeout = vi.fn(() =>
      statuses2.shift()
        ? Promise.resolve(new Response("", { status: 502 }))
        : Promise.reject(new DOMException("trop long", "TimeoutError")),
    );
    await expect(wakeCatalogApi("demo", API, { fetch: timeout, log, ...timing })).resolves.toBe(
      "failed",
    );
  });
});
