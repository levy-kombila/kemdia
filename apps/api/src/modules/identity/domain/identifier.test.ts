import { describe, expect, it } from "vitest";
import {
  maskIdentifier,
  normalizeEmail,
  normalizeGabonPhone,
  parseIdentifier,
  requireIdentifier,
} from "./identifier.js";
import { IdentityError } from "./identity-error.js";

describe("identifiant (FR-004)", () => {
  it("e-mail : espaces retirés, minuscules", () => {
    expect(normalizeEmail("  Awa.Ndong@Exemple.GA ")).toBe("awa.ndong@exemple.ga");
    expect(normalizeEmail("awa@exemple")).toBeNull();
    expect(normalizeEmail("awa @exemple.ga")).toBeNull();
    expect(normalizeEmail(`${"a".repeat(250)}@x.ga`)).toBeNull();
  });

  it("mobile gabonais : toutes les écritures courantes donnent +2410…", () => {
    for (const input of [
      "077123456",
      "077 12 34 56",
      "+241 77 12 34 56",
      "00241 077 12 34 56",
      "77123456",
    ]) {
      expect(normalizeGabonPhone(input)).toEqual({ value: "+241077123456", operator: "Airtel" });
    }
    expect(normalizeGabonPhone("062 00 00 00")).toEqual({
      value: "+241062000000",
      operator: "Moov",
    });
  });

  it("refuse les fixes, les numéros trop courts ou étrangers", () => {
    for (const input of [
      "011 00 00 00",
      "07712345",
      "0771234567",
      "+33 6 12 34 56 78",
      "07a123456",
    ]) {
      expect(normalizeGabonPhone(input)).toBeNull();
    }
  });

  it("un seul champ : « @ » → e-mail, sinon téléphone", () => {
    expect(parseIdentifier("Awa@Exemple.ga")).toEqual({ kind: "email", value: "awa@exemple.ga" });
    expect(parseIdentifier("066 12 34 56")).toEqual({
      kind: "phone",
      value: "+241066123456",
      operator: "Moov",
    });
    expect(parseIdentifier("bonjour")).toBeNull();
  });

  it("erreur métier sans recopier la valeur reçue", () => {
    try {
      requireIdentifier("secret-valeur");
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(IdentityError);
      expect((error as IdentityError).code).toBe("IDENTIFIANT_INVALIDE");
      expect((error as Error).message).not.toContain("secret-valeur");
    }
  });

  it("masquage pour les messages et les journaux", () => {
    expect(maskIdentifier(requireIdentifier("awa.ndong@exemple.ga"))).toBe("aw•••@exemple.ga");
    expect(maskIdentifier(requireIdentifier("077123456"))).toBe("077 •• •• 56");
  });
});
