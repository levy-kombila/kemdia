import { describe, expect, it, vi } from "vitest";
import { createDeepHealth } from "./deep-health";

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

describe("santé complète du site (S7-T06)", () => {
  it("API et base saines : ok, sans clé interne", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValue(json(200, { status: "ok", checks: { database: "ok" } }));
    const check = createDeepHealth({ url: "http://api:4000", fetch });
    expect(await check()).toEqual({ status: "ok", checks: { api: "ok", database: "ok" } });
    const [url, init] = fetch.mock.calls[0]!;
    expect(url).toBe("http://api:4000/api/health");
    expect(JSON.stringify(init)).not.toContain("internal-key");
  });

  it("base indisponible (503 de l'API) : dégradé, API vivante", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValue(json(503, { status: "degrade", checks: { database: "indisponible" } }));
    const check = createDeepHealth({ url: "http://api:4000", fetch });
    expect(await check()).toEqual({
      status: "degrade",
      checks: { api: "ok", database: "indisponible" },
    });
  });

  it("API injoignable ou réponse inattendue : dégradé", async () => {
    const down = createDeepHealth({
      url: "http://api:4000",
      fetch: vi.fn().mockRejectedValue(new TypeError("x")),
    });
    expect(await down()).toEqual({
      status: "degrade",
      checks: { api: "indisponible", database: "inconnue" },
    });
    const odd = createDeepHealth({
      url: "http://api:4000",
      fetch: vi.fn().mockResolvedValue(new Response("<html>", { status: 502 })),
    });
    expect(await odd()).toEqual({
      status: "degrade",
      checks: { api: "indisponible", database: "inconnue" },
    });
  });

  it("résultat gardé 10 s, une seule requête pour des appels simultanés", async () => {
    let t = 0;
    const fetch = vi.fn().mockImplementation(async () => json(200, { checks: { database: "ok" } }));
    const check = createDeepHealth({ url: "http://api:4000", fetch, now: () => t });
    await Promise.all([check(), check(), check()]);
    expect(fetch).toHaveBeenCalledTimes(1);
    t = 9_999;
    await check();
    expect(fetch).toHaveBeenCalledTimes(1);
    t = 10_001;
    await check();
    expect(fetch).toHaveBeenCalledTimes(2);
  });
});
