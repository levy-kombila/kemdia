import { describe, expect, it } from "vitest";
import {
  generateRecoveryCode,
  hashRecoveryCode,
  isSecondFactorRecent,
  normalizeRecoveryCode,
  RECOVERY_CODE_PATTERN,
  requiresSecondFactor,
} from "./second-factor.js";
import {
  base32Decode,
  base32Encode,
  generateTotpSecret,
  otpauthUri,
  totpCode,
  totpStep,
  verifyTotp,
} from "./totp.js";

// Secret des exemples de la RFC 6238 (annexe B, SHA-1) : « 12345678901234567890 » en ASCII
const RFC_SECRET = new TextEncoder().encode("12345678901234567890");
const at = (seconds: number) => new Date(seconds * 1000);

describe("TOTP (RFC 6238, S6-T03)", () => {
  it("donne les codes des exemples de la RFC (6 derniers chiffres)", () => {
    const vectors: [number, string][] = [
      [59, "287082"],
      [1_111_111_109, "081804"],
      [1_111_111_111, "050471"],
      [1_234_567_890, "005924"],
      [2_000_000_000, "279037"],
      [20_000_000_000, "353130"],
    ];
    for (const [seconds, code] of vectors) {
      expect(totpCode(RFC_SECRET, totpStep(at(seconds)))).toBe(code);
    }
  });

  it("accepte la période en cours et ses voisines, refuse au-delà", () => {
    const now = at(1_234_567_890);
    const step = totpStep(now);
    for (const delta of [-1, 0, 1]) {
      expect(verifyTotp(RFC_SECRET, totpCode(RFC_SECRET, step + delta), now, null)).toBe(
        step + delta,
      );
    }
    expect(verifyTotp(RFC_SECRET, totpCode(RFC_SECRET, step - 2), now, null)).toBeNull();
    expect(verifyTotp(RFC_SECRET, totpCode(RFC_SECRET, step + 2), now, null)).toBeNull();
  });

  it("refuse un code déjà utilisé (ou plus ancien) : pas de rejeu", () => {
    const now = at(1_234_567_890);
    const step = totpStep(now);
    const code = totpCode(RFC_SECRET, step);
    expect(verifyTotp(RFC_SECRET, code, now, step)).toBeNull();
    expect(verifyTotp(RFC_SECRET, totpCode(RFC_SECRET, step - 1), now, step - 1)).toBeNull();
    expect(verifyTotp(RFC_SECRET, code, now, step - 1)).toBe(step);
  });

  it("refuse ce qui n'est pas 6 chiffres", () => {
    for (const code of ["", "12345", "1234567", "12345a", " 123456"]) {
      expect(verifyTotp(RFC_SECRET, code, at(59), null)).toBeNull();
    }
  });

  it("base32 aller-retour ; secret de 160 bits ; adresse otpauth lisible par les applications", () => {
    const secret = generateTotpSecret();
    expect(secret).toHaveLength(20);
    expect(base32Decode(base32Encode(secret))).toEqual(secret);
    expect(base32Encode(RFC_SECRET)).toBe("GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ");
    expect(() => base32Decode("ABC1")).toThrow(RangeError);
    const uri = otpauthUri(RFC_SECRET, "awa@exemple.ga");
    expect(uri).toBe(
      "otpauth://totp/Kemdia%3Aawa%40exemple.ga?secret=GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ&issuer=Kemdia&algorithm=SHA1&digits=6&period=30",
    );
  });
});

describe("Règles de la 2FA de l'équipe (S6-T03)", () => {
  it("obligatoire pour les modérateurs et les administrateurs seulement", () => {
    expect(requiresSecondFactor(["client"])).toBe(false);
    expect(requiresSecondFactor(["client", "vendor"])).toBe(false);
    expect(requiresSecondFactor(["client", "moderator"])).toBe(true);
    expect(requiresSecondFactor(["client", "admin"])).toBe(true);
  });

  it("confirmation valable 15 minutes", () => {
    const now = new Date("2026-10-15T22:00:00.000Z");
    expect(isSecondFactorRecent(null, now)).toBe(false);
    expect(isSecondFactorRecent(new Date(now.getTime() - 14 * 60_000), now)).toBe(true);
    expect(isSecondFactorRecent(new Date(now.getTime() - 15 * 60_000), now)).toBe(false);
    // Date dans le futur (horloge faussée) : refusée
    expect(isSecondFactorRecent(new Date(now.getTime() + 60_000), now)).toBe(false);
  });

  it("codes de secours : forme lisible, saisie tolérante, empreinte liée au compte", () => {
    const codes = new Set(Array.from({ length: 50 }, generateRecoveryCode));
    expect(codes.size).toBe(50);
    for (const code of codes) expect(code).toMatch(RECOVERY_CODE_PATTERN);
    expect(normalizeRecoveryCode(" ABCD EFGH-JKMN ")).toBe("abcd-efgh-jkmn");
    expect(normalizeRecoveryCode("abcd-efgh-jkm")).toBeNull();
    expect(normalizeRecoveryCode("abcd-efgh-jkm0")).toBeNull();
    const a = "11111111-1111-4111-8111-111111111111";
    const b = "22222222-2222-4222-8222-222222222222";
    expect(hashRecoveryCode(a, "abcd-efgh-jkmn")).toMatch(/^[0-9a-f]{64}$/);
    expect(hashRecoveryCode(a, "abcd-efgh-jkmn")).not.toBe(hashRecoveryCode(b, "abcd-efgh-jkmn"));
    expect(hashRecoveryCode(a.toUpperCase(), "abcd-efgh-jkmn")).toBe(
      hashRecoveryCode(a, "abcd-efgh-jkmn"),
    );
  });
});
