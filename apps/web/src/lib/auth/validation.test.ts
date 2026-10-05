import { describe, expect, it } from "vitest";
import {
  formatGabonPhone,
  isValidOtp,
  maskIdentifier,
  normalizeEmail,
  normalizeGabonPhone,
  normalizeName,
  parseIdentifier,
  passwordIssues,
} from "./validation";

describe("normalizeGabonPhone", () => {
  it.each([
    ["077123456", "+241077123456", "Airtel"],
    ["077 12 34 56", "+241077123456", "Airtel"],
    ["+241 77 12 34 56", "+241077123456", "Airtel"],
    ["00241 077-12-34-56", "+241077123456", "Airtel"],
    ["066.12.34.56", "+241066123456", "Moov"],
  ])("accepte %s", (input, value, operator) => {
    expect(normalizeGabonPhone(input)).toEqual({ value, operator });
  });

  it.each([
    "",
    "0771234",
    "0771234567",
    "011234567",
    "+33612345678",
    "07712345a",
    "+241+241077123456",
  ])("refuse %s", (input) => expect(normalizeGabonPhone(input)).toBeNull());

  it("formate pour l'affichage", () => {
    expect(formatGabonPhone("+241077123456")).toBe("077 12 34 56");
  });
});

describe("normalizeEmail", () => {
  it("met en minuscules et retire les espaces", () => {
    expect(normalizeEmail("  Marie.Nze@Exemple.GA ")).toBe("marie.nze@exemple.ga");
  });
  it.each([
    "marie",
    "marie@",
    "@exemple.ga",
    "marie@exemple",
    "ma rie@exemple.ga",
    `${"a".repeat(250)}@x.ga`,
  ])("refuse %s", (input) => expect(normalizeEmail(input)).toBeNull());
});

describe("parseIdentifier", () => {
  it("reconnaît un e-mail ou un téléphone", () => {
    expect(parseIdentifier("paul@kemdia.ga")).toEqual({ kind: "email", value: "paul@kemdia.ga" });
    expect(parseIdentifier("065 00 11 22")).toEqual({
      kind: "phone",
      value: "+241065001122",
      operator: "Moov",
    });
    expect(parseIdentifier("pas valide")).toBeNull();
  });

  it("masque l'identifiant affiché sur l'écran du code", () => {
    expect(maskIdentifier(parseIdentifier("077123456")!)).toBe("077 •• •• 56");
    expect(maskIdentifier(parseIdentifier("marie@exemple.ga")!)).toBe("ma•••@exemple.ga");
  });
});

describe("passwordIssues", () => {
  it("accepte un mot de passe correct", () => {
    expect(passwordIssues("Libreville2026!")).toEqual([]);
  });
  it("signale chaque règle non respectée", () => {
    expect(passwordIssues("abc")).toEqual(["length", "digit"]);
    expect(passwordIssues("12345678")).toEqual(["letter", "common"]);
    expect(passwordIssues("Azerty123")).toEqual(["common"]);
    expect(passwordIssues("a1".repeat(65))).toContain("max");
  });
});

describe("normalizeName", () => {
  it("accepte accents, apostrophes et tirets", () => {
    expect(normalizeName("  N'Dong   Mba-Obame ")).toBe("N'Dong Mba-Obame");
    expect(normalizeName("Élodie")).toBe("Élodie");
  });
  it.each(["", "A", "<script>", "Marie2", "x".repeat(61)])("refuse %s", (input) =>
    expect(normalizeName(input)).toBeNull(),
  );
});

describe("isValidOtp", () => {
  it("exige 6 chiffres", () => {
    expect(isValidOtp("123456")).toBe(true);
    expect(isValidOtp("12345")).toBe(false);
    expect(isValidOtp("12345a")).toBe(false);
  });
});
