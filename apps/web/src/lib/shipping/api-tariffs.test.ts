import { describe, expect, it, vi } from "vitest";
import { ZONES } from "@kemdia/contracts/delivery";

vi.mock("server-only", () => ({}));
const { createTariffSource, TARIFF_TTL_MS } = await import("./api-tariffs");

const TARIFFS = {
  zones: (["zone_1", "zone_2", "zone_3", "zone_4"] as const).map((id) => ({
    id,
    label: "ignoré",
    baseFee: id === "zone_1" ? 1_750 : ZONES[id].baseFee,
    freeThreshold: ZONES[id].freeThreshold,
    daysMin: ZONES[id].daysMin,
    daysMax: ZONES[id].daysMax,
  })),
  updatedAt: "2026-10-18T10:00:00.000Z",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

function source(respond: () => Promise<Response>) {
  let clock = 1_000_000;
  const fetch = vi.fn(respond);
  const tariffs = createTariffSource({
    url: "http://api.test",
    key: "k".repeat(40),
    timeoutMs: 1_000,
    fetch: fetch as unknown as typeof globalThis.fetch,
    now: () => clock,
  });
  return { tariffs, fetch, advance: (ms: number) => (clock += ms) };
}

describe("barème du site (S7-T02)", () => {
  it("lu une fois, gardé 5 minutes ; noms des zones du contrat ; clé interne envoyée", async () => {
    const { tariffs, fetch } = source(() => Promise.resolve(json(TARIFFS)));
    const table = await tariffs.current();
    expect(table.zone_1).toMatchObject({ baseFee: 1_750, label: ZONES.zone_1.label });
    await tariffs.current();
    expect(fetch).toHaveBeenCalledTimes(1);
    const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("http://api.test/api/v1/shipping/tariffs");
    expect(Object.values(init.headers as Record<string, string>)).toContain("k".repeat(40));
  });

  it("au-delà de 5 minutes : valeur gardée rendue tout de suite, relue en arrière-plan", async () => {
    let fee = 1_750;
    const { tariffs, fetch, advance } = source(() =>
      Promise.resolve(
        json({ ...TARIFFS, zones: TARIFFS.zones.map((z) => ({ ...z, baseFee: fee })) }),
      ),
    );
    await tariffs.current();
    fee = 2_500;
    advance(TARIFF_TTL_MS + 1);
    expect((await tariffs.current()).zone_1.baseFee).toBe(1_750);
    await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
    await vi.waitFor(async () => expect((await tariffs.current()).zone_1.baseFee).toBe(2_500));
  });

  it("API injoignable ou réponse non conforme : barème du contrat", async () => {
    const down = source(() => Promise.reject(new TypeError("fetch failed")));
    expect(await down.tariffs.current()).toEqual(ZONES);
    const bad = source(() => Promise.resolve(json({ zones: [] })));
    expect(await bad.tariffs.current()).toEqual(ZONES);
    const error = source(() => Promise.resolve(json({}, 500)));
    expect(await error.tariffs.current()).toEqual(ZONES);
  });

  it("réponse trop lourde (plus de 16 Ko) : refusée, barème du contrat", async () => {
    const huge = source(() => Promise.resolve(json({ ...TARIFFS, padding: "x".repeat(20_000) })));
    expect(await huge.tariffs.current()).toEqual(ZONES);
  });

  it("toute première lecture trop lente : barème du contrat après 1 s, sans attendre l'API", async () => {
    vi.useFakeTimers();
    try {
      const { tariffs } = source(() => new Promise<Response>(() => undefined));
      const pending = tariffs.current();
      await vi.advanceTimersByTimeAsync(1_000);
      expect(await pending).toEqual(ZONES);
    } finally {
      vi.useRealTimers();
    }
  });
});
