import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { AesKycBox } from "./kyc-box.js";

const KEY = randomBytes(32).toString("base64url");
const SHOP = "11111111-1111-4111-8111-111111111111";
const plain = new TextEncoder().encode("GA123456789");

describe("chiffrement des dossiers de vérification (S6-T08)", () => {
  it("clé de développement : poste local seulement ; jamais en démo ni en production", () => {
    expect(new AesKycBox({ APP_ENV: "local", NODE_ENV: "development" }).usesDevelopmentKey).toBe(
      true,
    );
    expect(new AesKycBox({ APP_ENV: "demo", NODE_ENV: "production" }).available).toBe(false);
    expect(new AesKycBox({ APP_ENV: "production", NODE_ENV: "production" }).available).toBe(false);
    const demo = new AesKycBox({ APP_ENV: "demo", NODE_ENV: "production" });
    expect(() => demo.seal(plain, `${SHOP}:id_number`)).toThrow(/indisponible/);
  });

  it("boîte liée à sa boutique et à son champ ; modifiée ou autre clé : refusée", () => {
    const box = new AesKycBox({
      KYC_ENCRYPTION_KEY: KEY,
      APP_ENV: "production",
      NODE_ENV: "production",
    });
    const sealed = box.seal(plain, `${SHOP}:id_number`);
    expect(Buffer.from(sealed).includes(Buffer.from("GA123456789"))).toBe(false);
    expect(new TextDecoder().decode(box.open(sealed, `${SHOP}:id_number`))).toBe("GA123456789");
    expect(() => box.open(sealed, `${SHOP}:payout_account`)).toThrow();
    const tampered = new Uint8Array(sealed);
    tampered[tampered.length - 1]! ^= 1;
    expect(() => box.open(tampered, `${SHOP}:id_number`)).toThrow();
    const other = new AesKycBox({
      KYC_ENCRYPTION_KEY: randomBytes(32).toString("base64url"),
      APP_ENV: "production",
      NODE_ENV: "production",
    });
    expect(() => other.open(sealed, `${SHOP}:id_number`)).toThrow();
  });
});
