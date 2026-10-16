import { createHmac } from "node:crypto";

/**
 * Code TOTP (RFC 6238 : SHA-1, 6 chiffres, 30 s), calculé comme le ferait une application d'authentification à partir
 * de la clé affichée sur la page « Sécurité » (S6-T05). Pour les tests de bout en bout seulement.
 */
const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

function base32(secret: string): Buffer {
  let bits = "";
  for (const char of secret.replace(/\s/g, "").toUpperCase()) {
    const value = ALPHABET.indexOf(char);
    if (value < 0) throw new Error("clé base32 invalide");
    bits += value.toString(2).padStart(5, "0");
  }
  const bytes = bits.match(/.{8}/g) ?? [];
  return Buffer.from(bytes.map((b) => parseInt(b, 2)));
}

export function totp(secret: string, now = Date.now()): string {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(now / 1000 / 30)));
  const hmac = createHmac("sha1", base32(secret)).update(counter).digest();
  const offset = hmac[hmac.length - 1]! & 0x0f;
  const value = (hmac.readUInt32BE(offset) & 0x7fffffff) % 1_000_000;
  return String(value).padStart(6, "0");
}
