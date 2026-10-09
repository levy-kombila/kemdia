import { describe, expect, it } from "vitest";
import { clientIpHeaderName, visitorIp } from "./client-ip";

const h = (headers: Record<string, string>) => new Headers(headers);

describe("adresse du visiteur transmise à l'API (S4-T07)", () => {
  it("désactivé par défaut : rien n'est transmis", () => {
    expect(clientIpHeaderName({})).toBeNull();
    expect(visitorIp(h({ "x-forwarded-for": "1.2.3.4" }), null)).toBeNull();
  });

  it("nom d'en-tête validé (rien d'injectable)", () => {
    expect(clientIpHeaderName({ CLIENT_IP_HEADER: " True-Client-IP " })).toBe("true-client-ip");
    expect(() => clientIpHeaderName({ CLIENT_IP_HEADER: "x-ip\r\nset-cookie" })).toThrow(
      /CLIENT_IP_HEADER/,
    );
  });

  it("X-Forwarded-For : la dernière adresse (posée par le relais), jamais celle choisie par le visiteur", () => {
    expect(visitorIp(h({ "x-forwarded-for": "6.6.6.6, 203.0.113.9" }), "x-forwarded-for")).toBe(
      "203.0.113.9",
    );
  });

  it("autre en-tête : une seule adresse valable, sinon rien", () => {
    expect(visitorIp(h({ "true-client-ip": "2001:db8::7" }), "true-client-ip")).toBe("2001:db8::7");
    expect(visitorIp(h({ "true-client-ip": "1.1.1.1, 2.2.2.2" }), "true-client-ip")).toBeNull();
    expect(visitorIp(h({ "true-client-ip": "pirate" }), "true-client-ip")).toBeNull();
    expect(visitorIp(h({}), "true-client-ip")).toBeNull();
  });
});
