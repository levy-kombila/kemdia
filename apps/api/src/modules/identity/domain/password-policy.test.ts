import { describe, expect, it } from "vitest";
import { assertStrongPassword, normalizeName, passwordIssues } from "./password-policy.js";

describe("mot de passe", () => {
  it("accepte 8 caractères avec une lettre et un chiffre", () => {
    expect(passwordIssues("Mangue2026")).toEqual([]);
    expect(passwordIssues("éléphant7")).toEqual([]);
  });

  it("liste ce qui manque", () => {
    expect(passwordIssues("abc")).toEqual(["length", "digit"]);
    expect(passwordIssues("12345678")).toEqual(["letter", "common"]);
    expect(passwordIssues("a1".repeat(65))).toEqual(["max"]);
  });

  it("refuse les mots de passe courants quelle que soit la casse", () => {
    expect(passwordIssues("AZERTY123")).toContain("common");
    expect(passwordIssues("Kemdia2026")).toContain("common");
  });

  it("le message ne contient jamais le mot de passe", () => {
    expect(() => assertStrongPassword("azerty123")).toThrow(/trop courant/);
    expect(() => assertStrongPassword("azerty123")).not.toThrow(/azerty123/);
  });
});

describe("prénom et nom", () => {
  it("espaces normalisés, accents, tirets et apostrophes permis", () => {
    expect(normalizeName("  Marie-Ève  ")).toBe("Marie-Ève");
    expect(normalizeName("N'Guema   Obame")).toBe("N'Guema Obame");
  });

  it("refuse chiffres, symboles, trop court ou trop long", () => {
    for (const name of ["A", "Awa2", "<script>", "-Awa", "a".repeat(61)]) {
      expect(normalizeName(name)).toBeNull();
    }
  });
});
