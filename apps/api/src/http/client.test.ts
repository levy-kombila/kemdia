import type { Request } from "express";
import { describe, expect, it } from "vitest";
import { loadConfig } from "../config/env.js";
import { normalizeIp, rateKey, resolveClient } from "./client.js";

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

  it("le site sans visiteur (lecture du catalogue) : pas de visiteur, pas de limite par adresse", () => {
    expect(resolveClient(req({ "x-kemdia-internal-key": KEY }), config)).toEqual({
      ip: "10.0.0.9",
      viaSite: true,
      visitorKnown: false,
    });
  });

  it("le site annonce un visiteur illisible : compteur commun « inconnue », jamais d'exemption", () => {
    for (const value of ["1.2.3.4, 5.6.7.8", "<script>", "inconnue", "fe80::1%eth0"]) {
      expect(
        resolveClient(req({ "x-kemdia-internal-key": KEY, "x-kemdia-client-ip": value }), config),
      ).toEqual({ ip: "inconnue", viaSite: true, visitorKnown: true });
    }
  });

  it("compteur par adresse : IPv4 entière, IPv6 regroupée par /64 (un abonné a tout un bloc)", () => {
    expect(rateKey("203.0.113.4")).toBe("203.0.113.4");
    expect(rateKey("2001:db8::1")).toBe(rateKey("2001:db8::12"));
    expect(rateKey("2001:db8:0:0:abcd::1")).toBe("2001:db8:0:0::/64");
    expect(rateKey("2001:db8:0:1::1")).not.toBe(rateKey("2001:db8:0:2::1"));
    expect(rateKey("::1")).toBe("0:0:0:0::/64");
    expect(rateKey("inconnue")).toBe("inconnue");
  });

  it("adresses : IPv4 dans IPv6 ramenée en IPv4, le reste refusé", () => {
    expect(normalizeIp("::ffff:203.0.113.4")).toBe("203.0.113.4");
    expect(normalizeIp(" 203.0.113.4 ")).toBe("203.0.113.4");
    expect(normalizeIp("pirate.example")).toBeNull();
    expect(normalizeIp(undefined)).toBeNull();
    expect(normalizeIp("::1%aaaa")).toBeNull();
  });
});
