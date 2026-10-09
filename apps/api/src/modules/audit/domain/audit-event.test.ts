import { describe, expect, it } from "vitest";
import { assertValidEntry, NO_REQUEST, type AuditEntry } from "./audit-event.js";

const ID = "11111111-1111-4111-8111-111111111111";
const entry = (over: Partial<AuditEntry> = {}): AuditEntry => ({
  action: "role.granted",
  actor: { type: "account", id: ID },
  target: { type: "account", id: ID },
  details: { role: "vendor", source: "api" },
  context: NO_REQUEST,
  ...over,
});

describe("Journal d'audit : entrée valide (S4-T06)", () => {
  it("accepte une entrée normale, avec ou sans cible, par un compte ou par le serveur", () => {
    expect(() => assertValidEntry(entry())).not.toThrow();
    expect(() =>
      assertValidEntry(entry({ actor: { type: "system" }, target: null })),
    ).not.toThrow();
    expect(() => assertValidEntry(entry({ details: { count: 3 } }))).not.toThrow();
  });

  it("refuse une action inconnue ou des identifiants qui ne sont pas des UUID", () => {
    expect(() => assertValidEntry(entry({ action: "tout.effacer" as never }))).toThrow();
    expect(() => assertValidEntry(entry({ actor: { type: "account", id: "42" } }))).toThrow();
    expect(() => assertValidEntry(entry({ target: { type: "account", id: "x" } }))).toThrow();
  });

  it("détails : courts, sans caractère de contrôle, 8 au plus", () => {
    expect(() => assertValidEntry(entry({ details: { note: "a".repeat(101) } }))).toThrow();
    expect(() => assertValidEntry(entry({ details: { note: "ligne\nfausse" } }))).toThrow();
    expect(() => assertValidEntry(entry({ details: { "mot de passe": "x" } }))).toThrow();
    expect(() => assertValidEntry(entry({ details: { count: 1.5 } }))).toThrow();
    const many = Object.fromEntries(Array.from({ length: 9 }, (_, i) => [`k${i}`, "v"]));
    expect(() => assertValidEntry(entry({ details: many }))).toThrow();
  });
});
