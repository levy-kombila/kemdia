import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { GET, OPTIONS, POST } from "./route";

const KEY = "k".repeat(40);
const call = (headers: Record<string, string>) =>
  GET(new Request("http://localhost/api/diagnostic-ip", { headers }));

describe("diagnostic temporaire de l'adresse du visiteur (S4-T07)", () => {
  const previous = process.env.API_INTERNAL_KEY;
  beforeEach(() => {
    process.env.API_INTERNAL_KEY = KEY;
  });
  afterEach(() => {
    if (previous === undefined) delete process.env.API_INTERNAL_KEY;
    else process.env.API_INTERNAL_KEY = previous;
  });

  it("sans la clé interne, ou avec une mauvaise : 404, rien n'est révélé", async () => {
    const attempts: Record<string, string>[] = [
      {},
      { "x-kemdia-internal-key": "x".repeat(40) },
      // Début de la clé seulement, clé trop longue
      { "x-kemdia-internal-key": KEY.slice(0, 20) },
      { "x-kemdia-internal-key": `${KEY}k` },
    ];
    for (const headers of attempts) {
      const res = call({ ...headers, "cf-connecting-ip": "203.0.113.5" });
      expect(res.status).toBe(404);
      expect(await res.text()).toBe("");
      expect(res.headers.get("cache-control")).toBe("no-store");
    }
  });

  it("avec la clé : SEULEMENT CF-Connecting-IP et l'adresse retenue, jamais d'autre en-tête", async () => {
    const res = call({
      "x-kemdia-internal-key": KEY,
      "cf-connecting-ip": "203.0.113.5",
      "x-forwarded-for": "6.6.6.6, 10.0.0.1",
      cookie: "secret=1",
    });
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");
    const body = (await res.json()) as Record<string, unknown>;
    expect(body).toEqual({
      enTete: "cf-connecting-ip",
      valeurRecue: "203.0.113.5",
      adresseRetenue: "203.0.113.5",
    });
    expect(JSON.stringify(body)).not.toMatch(/6\.6\.6\.6|secret|kkkk/);
  });

  it("valeur absente ou invalide : rien n'est retenu", async () => {
    const res = call({ "x-kemdia-internal-key": KEY, "cf-connecting-ip": "1.2.3.4, 5.6.7.8" });
    expect(await res.json()).toMatchObject({ adresseRetenue: null });
  });

  it("autres méthodes : la même 404, la route ne se signale pas", () => {
    expect(OPTIONS().status).toBe(404);
    expect(POST().status).toBe(404);
  });

  it("clé interne non configurée sur le serveur : toujours 404", () => {
    delete process.env.API_INTERNAL_KEY;
    expect(call({ "x-kemdia-internal-key": "" }).status).toBe(404);
  });
});
