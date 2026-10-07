import { describe, expect, it } from "vitest";
import * as identifier from "../src/modules/identity/domain/identifier.js";
import * as otp from "../src/modules/identity/domain/otp.js";
import * as password from "../src/modules/identity/domain/password-policy.js";

/**
 * Règles d'identité écrites deux fois : dans le site (S2-T01, message immédiat) et dans l'API (S4-T01, fait foi).
 * Si une règle change d'un côté seulement, ce test échoue.
 */
// Fichiers du site chargés à l'exécution : TypeScript ne les inclut pas dans le projet de l'API (autre paquet)
type SiteIdentifier = identifier.Identifier;
interface SiteValidation {
  EMAIL_MAX_LENGTH: number;
  PASSWORD_MIN_LENGTH: number;
  PASSWORD_MAX_LENGTH: number;
  NAME_MAX_LENGTH: number;
  OTP_LENGTH: number;
  parseIdentifier(input: string): SiteIdentifier | null;
  maskIdentifier(id: SiteIdentifier): string;
  passwordIssues(input: string): string[];
  normalizeName(input: string): string | null;
}
interface SiteAuthClient {
  OTP_MAX_ATTEMPTS: number;
  OTP_RESEND_DELAY_S: number;
}
const SITE_AUTH = new URL("../../web/src/lib/auth/", import.meta.url);
const site = (await import(new URL("validation.ts", SITE_AUTH).pathname)) as SiteValidation;
const siteClient = (await import(new URL("client.ts", SITE_AUTH).pathname)) as SiteAuthClient;

const IDENTIFIERS = [
  "awa@exemple.ga",
  "  Awa.Ndong@Exemple.GA ",
  "awa@exemple",
  "awa @exemple.ga",
  "@exemple.ga",
  "077123456",
  "077 12 34 56",
  "+241 77 12 34 56",
  "00241 077 12 34 56",
  "66123456",
  "011 00 00 00",
  "07712345",
  "+33 6 12 34 56 78",
  "bonjour",
  "",
];

const PASSWORDS = [
  "Mangue2026",
  "abc",
  "12345678",
  "azerty123",
  "AZERTY123",
  "éléphant7",
  "a1".repeat(65),
  "motdepasse",
];
const NAMES = ["Awa", "  Marie-Ève ", "N'Guema   Obame", "A", "Awa2", "-Awa", "a".repeat(61)];

describe("Site et API alignés (identité)", () => {
  it("mêmes longueurs et mêmes réglages des codes", () => {
    expect(identifier.EMAIL_MAX_LENGTH).toBe(site.EMAIL_MAX_LENGTH);
    expect(password.PASSWORD_MIN_LENGTH).toBe(site.PASSWORD_MIN_LENGTH);
    expect(password.PASSWORD_MAX_LENGTH).toBe(site.PASSWORD_MAX_LENGTH);
    expect(password.NAME_MAX_LENGTH).toBe(site.NAME_MAX_LENGTH);
    expect(otp.OTP_LENGTH).toBe(site.OTP_LENGTH);
    expect(otp.OTP_MAX_ATTEMPTS).toBe(siteClient.OTP_MAX_ATTEMPTS);
    expect(otp.OTP_RESEND_DELAY_MS / 1000).toBe(siteClient.OTP_RESEND_DELAY_S);
  });

  it.each(IDENTIFIERS)("identifiant « %s »", (input) => {
    expect(identifier.parseIdentifier(input)).toEqual(site.parseIdentifier(input));
  });

  it.each(IDENTIFIERS.filter((i) => i.includes("@")))("masquage de « %s »", (input) => {
    const parsed = identifier.parseIdentifier(input);
    if (parsed) expect(identifier.maskIdentifier(parsed)).toBe(site.maskIdentifier(parsed));
  });

  it("masquage d'un numéro", () => {
    const parsed = identifier.requireIdentifier("077123456");
    expect(identifier.maskIdentifier(parsed)).toBe(site.maskIdentifier(parsed));
  });

  it.each(PASSWORDS)("mot de passe « %s »", (input) => {
    // L'API refuse au moins tout ce que le site refuse (sa liste de mots de passe courants est plus longue)
    const api = password.passwordIssues(input);
    for (const issue of site.passwordIssues(input)) expect(api).toContain(issue);
  });

  it("le site ne refuse aucun mot de passe que l'API accepte… et l'API n'ajoute que la liste des courants", () => {
    for (const input of PASSWORDS) {
      const extra = password
        .passwordIssues(input)
        .filter((i) => !site.passwordIssues(input).includes(i));
      expect(extra.every((i) => i === "common")).toBe(true);
    }
  });

  it.each(NAMES)("nom « %s »", (input) => {
    expect(password.normalizeName(input)).toBe(site.normalizeName(input));
  });
});
