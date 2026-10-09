import { describe, expect, it } from "vitest";
import { buildCsp, generateNonce } from "./csp";

describe("CSP à nonce (S4-T07)", () => {
  it("nonce : 16 octets aléatoires, différent à chaque appel", () => {
    const nonces = new Set(Array.from({ length: 50 }, generateNonce));
    expect(nonces.size).toBe(50);
    for (const nonce of nonces) expect(atob(nonce)).toHaveLength(16);
  });

  it("production : scripts au nonce seulement, jamais 'unsafe-inline' ni 'unsafe-eval' pour les scripts", () => {
    const csp = buildCsp("abc123==");
    const scripts = csp.split("; ").find((d) => d.startsWith("script-src"));
    expect(scripts).toBe("script-src 'self' 'nonce-abc123==' 'strict-dynamic'");
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("base-uri 'self'");
  });

  it("développement : 'unsafe-eval' (messages d'erreur de React)", () => {
    expect(buildCsp("n", { dev: true })).toContain("'unsafe-eval'");
    expect(buildCsp("n")).not.toContain("upgrade-insecure-requests");
  });
});
