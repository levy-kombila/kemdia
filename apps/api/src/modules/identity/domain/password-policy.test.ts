import { describe, expect, it } from "vitest";
import { assertStrongPassword, normalizeName, passwordIssues } from "./password-policy.js";

describe("mot de passe", () => {
  it("accepte 8 caractères, sans règle de composition (ASVS 5.0 V6.2.5)", () => {
    expect(passwordIssues("Mangue2026")).toEqual([]);
    expect(passwordIssues("éléphant7")).toEqual([]);
    // Lettres seules, chiffres seuls, phrase de passe, symboles : permis s'ils ne sont pas courants
    expect(passwordIssues("manguiers du jardin")).toEqual([]);
    expect(passwordIssues("73915048266")).toEqual([]);
    expect(passwordIssues("é€¥£ ±§¶∆")).toEqual([]);
  });

  it("liste ce qui ne va pas", () => {
    expect(passwordIssues("abc")).toEqual(["length"]);
    expect(passwordIssues("12345678")).toEqual(["common"]);
    expect(passwordIssues("a1".repeat(65))).toEqual(["max"]);
  });

  it("refuse les 10 000 mots de passe courants (ASVS 5.0 V6.2.4), quelle que soit la casse", () => {
    for (const common of ["password", "Baseball", "qwertyuiop", "superman", "iloveyou"]) {
      expect(passwordIssues(common)).toContain("common");
    }
  });

  it("vérifie le mot de passe tel quel : espaces et casse comptent (ASVS 5.0 V6.2.8)", () => {
    expect(passwordIssues(" password ")).toEqual([]);
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
