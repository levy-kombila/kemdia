import type { Request } from "express";
import { describe, expect, it } from "vitest";
import { loadConfig } from "../config/env.js";
import { normalizeIp, resolveClient } from "./client.js";

const KEY = "k".repeat(40);
const config = loadConfig({ NODE_ENV: "test", API_INTERNAL_KEY: KEY });
const req = (headers: Record<string, string>, ip = "10.0.0.9") =>
  ({ headers, ip }) as unknown as Request;

describe("qui appelle l'API (S4-T07)", () => {
  it("appel direct : son adresse, l'en-tête visiteur est ignoré (pas d'usurpation)", () => {
    expect(resolveClient(req({ "x-kemdia-client-ip": "1.2.3.4" }), config)).toEqual({
      ip: "10.0.0.9",
      viaSite: false,
      visitorKnown: true,
    });
    // Mauvaise clé : même chose
    expect(
      resolveClient(
        req({ "x-kemdia-internal-key": "x".repeat(40), "x-kemdia-client-ip": "1.2.3.4" }),
        config,
      ),
    ).toMatchObject({ ip: "10.0.0.9", viaSite: false });
  });

  it("le site avec sa clé et l'adresse du visiteur : c'est le visiteur", () => {
    expect(
      resolveClient(
        req({ "x-kemdia-internal-key": KEY, "x-kemdia-client-ip": "2001:DB8::1" }),
        config,
      ),
    ).toEqual({ ip: "2001:db8::1", viaSite: true, visitorKnown: true });
  });

  it("le site sans visiteur, ou avec une adresse illisible : visiteur inconnu", () => {
    const cases: Record<string, string>[] = [
      { "x-kemdia-internal-key": KEY },
      { "x-kemdia-internal-key": KEY, "x-kemdia-client-ip": "1.2.3.4, 5.6.7.8" },
      { "x-kemdia-internal-key": KEY, "x-kemdia-client-ip": "<script>" },
    ];
    for (const headers of cases) {
      expect(resolveClient(req(headers), config)).toEqual({
        ip: "10.0.0.9",
        viaSite: true,
        visitorKnown: false,
      });
    }
  });

  it("adresses : IPv4 dans IPv6 ramenée en IPv4, le reste refusé", () => {
    expect(normalizeIp("::ffff:203.0.113.4")).toBe("203.0.113.4");
    expect(normalizeIp(" 203.0.113.4 ")).toBe("203.0.113.4");
    expect(normalizeIp("pirate.example")).toBeNull();
    expect(normalizeIp(undefined)).toBeNull();
  });
});
