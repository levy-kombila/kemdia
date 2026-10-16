import { describe, expect, it } from "vitest";
import { AesSecretBox } from "./aes-secret-box.js";

const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";
const KEY = Buffer.alloc(32, 7).toString("base64url");
const secret = new Uint8Array(Array.from({ length: 20 }, (_, i) => i));

describe("Chiffrement des secrets TOTP (S6-T03)", () => {
  it("aller-retour ; 49 octets (version, IV, étiquette, secret) ; IV neuf à chaque fois", () => {
    const box = new AesSecretBox({
      TOTP_ENCRYPTION_KEY: KEY,
      APP_ENV: "production",
      NODE_ENV: "production",
    });
    const sealed = box.seal(secret, A);
    expect(sealed).toHaveLength(49);
    expect(sealed[0]).toBe(1);
    expect(box.open(sealed, A)).toEqual(secret);
    expect(Buffer.from(box.seal(secret, A)).equals(Buffer.from(sealed))).toBe(false);
  });

  it("refuse une boîte copiée sur un autre compte, modifiée ou chiffrée avec une autre clé", () => {
    const box = new AesSecretBox({
      TOTP_ENCRYPTION_KEY: KEY,
      APP_ENV: "production",
      NODE_ENV: "production",
    });
    const sealed = box.seal(secret, A);
    expect(() => box.open(sealed, B)).toThrow();
    const tampered = new Uint8Array(sealed);
    tampered[40] = tampered[40]! ^ 1;
    expect(() => box.open(tampered, A)).toThrow();
    const other = new AesSecretBox({
      TOTP_ENCRYPTION_KEY: Buffer.alloc(32, 9).toString("base64url"),
      APP_ENV: "production",
      NODE_ENV: "production",
    });
    expect(() => other.open(sealed, A)).toThrow();
    // L'UUID en majuscules désigne le même compte (comme PostgreSQL)
    expect(box.open(sealed, A.toUpperCase())).toEqual(secret);
  });

  it("clé de développement sur le poste et en démo seulement ; ailleurs sans clé : indisponible", () => {
    expect(new AesSecretBox({ APP_ENV: "local", NODE_ENV: "development" }).available).toBe(true);
    expect(new AesSecretBox({ APP_ENV: "local", NODE_ENV: "test" }).available).toBe(true);
    // Démo (Render, en-ligne.ps1) : aucun vrai compte d'équipe ; choix du propriétaire du 2026-10-16
    const demo = new AesSecretBox({ APP_ENV: "demo", NODE_ENV: "production" });
    expect(demo.available).toBe(true);
    expect(demo.usesDevelopmentKey).toBe(true);
    for (const config of [
      { APP_ENV: "local", NODE_ENV: "production" },
      { APP_ENV: "staging", NODE_ENV: "production" },
    ] as const) {
      const box = new AesSecretBox(config);
      expect(box.available).toBe(false);
      expect(() => box.seal(secret, A)).toThrow("TOTP_ENCRYPTION_KEY absente");
    }
  });
});
