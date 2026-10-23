import { describe, expect, it, vi } from "vitest";
import { fetchSuggestions } from "./api-suggestions";

vi.mock("server-only", () => ({}));

const body = { products: [], categories: [{ slug: "audio", name: "Audio" }], brands: [] };
const options = (fetch: typeof globalThis.fetch, visitorIp: string | null = "203.0.113.7") => ({
  url: "https://api.test",
  key: "cle-interne",
  timeoutMs: 1_000,
  visitorIp,
  fetch,
});

describe("suggestions demandées à l'API (S7.5-T06)", () => {
  it("transmet la clé interne et l'adresse du visiteur, sans cache partagé", async () => {
    const fetch = vi.fn(() => Promise.resolve(Response.json(body)));
    const result = await fetchSuggestions(options(fetch), "aud");
    expect(result).toEqual({ status: "ok", data: body });
    const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.test/api/v1/products/suggestions?q=aud");
    expect(init.headers).toMatchObject({
      "x-kemdia-internal-key": "cle-interne",
      "x-kemdia-client-ip": "203.0.113.7",
    });
    expect(init.cache).toBe("no-store");
  });

  it("limite atteinte, panne, réponse non conforme", async () => {
    const reply = (r: Response) => vi.fn(() => Promise.resolve(r));
    expect(
      await fetchSuggestions(options(reply(new Response(null, { status: 429 }))), "ab"),
    ).toEqual({ status: "too-many" });
    expect(
      await fetchSuggestions(options(reply(new Response(null, { status: 500 }))), "ab"),
    ).toEqual({ status: "unavailable" });
    expect(await fetchSuggestions(options(reply(Response.json({ items: [] }))), "ab")).toEqual({
      status: "unavailable",
    });
    const broken = vi.fn(() => Promise.reject(new TypeError("réseau")));
    expect(await fetchSuggestions(options(broken, null), "ab")).toEqual({ status: "unavailable" });
  });
});
