import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * Codes TOTP (RFC 6238, S6-T03, ADR-0034) : ceux des applications d'authentification (Google Authenticator, Authy,
 * Microsoft Authenticator…). HMAC-SHA1, 6 chiffres, toutes les 30 secondes : les réglages que TOUTES ces applications
 * comprennent. Secret de 160 bits (RFC 4226).
 *
 * - Un code est accepté pendant sa période et la précédente ou la suivante (horloge du téléphone décalée de ±30 s).
 * - Un code déjà utilisé (ou plus ancien) est refusé : `lastUsedStep` empêche de le rejouer.
 */
export const TOTP_DIGITS = 6;
export const TOTP_PERIOD_SECONDS = 30;
export const TOTP_SECRET_BYTES = 20;
/** Périodes acceptées de chaque côté de la période en cours. */
export const TOTP_WINDOW = 1;
export const TOTP_CODE_PATTERN = /^\d{6}$/;

const BASE32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

/** Base32 (RFC 4648, sans « = ») : la forme du secret que l'on tape à la main dans une application. */
export function base32Encode(bytes: Uint8Array): string {
  let bits = 0;
  let value = 0;
  let out = "";
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += BASE32[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += BASE32[(value << (5 - bits)) & 31];
  return out;
}

export function base32Decode(text: string): Uint8Array {
  const clean = text.replace(/[\s=]/g, "").toUpperCase();
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const char of clean) {
    const index = BASE32.indexOf(char);
    if (index < 0) throw new RangeError("secret base32 invalide");
    value = (value << 5) | index;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Uint8Array.from(out);
}

export function generateTotpSecret(): Uint8Array {
  return new Uint8Array(randomBytes(TOTP_SECRET_BYTES));
}

/** Numéro de la période de 30 s qui contient `now`. */
export function totpStep(now: Date): number {
  return Math.floor(now.getTime() / 1000 / TOTP_PERIOD_SECONDS);
}

/** Code d'une période (RFC 4226 : HMAC, troncature dynamique). */
export function totpCode(secret: Uint8Array, step: number): string {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(step));
  const hmac = createHmac("sha1", secret).update(counter).digest();
  const offset = hmac[hmac.length - 1]! & 0x0f;
  const binary =
    ((hmac[offset]! & 0x7f) << 24) |
    (hmac[offset + 1]! << 16) |
    (hmac[offset + 2]! << 8) |
    hmac[offset + 3]!;
  return String(binary % 10 ** TOTP_DIGITS).padStart(TOTP_DIGITS, "0");
}

/**
 * Vérifie un code ; renvoie la période trouvée (à enregistrer comme `lastUsedStep`), ou `null`.
 * Comparaison en temps constant ; une période déjà utilisée (≤ `lastUsedStep`) n'est jamais acceptée.
 */
export function verifyTotp(
  secret: Uint8Array,
  code: string,
  now: Date,
  lastUsedStep: number | null,
): number | null {
  if (!TOTP_CODE_PATTERN.test(code)) return null;
  const current = totpStep(now);
  const given = Buffer.from(code);
  let found: number | null = null;
  // Toutes les périodes sont calculées, même après une réussite : même durée quel que soit le résultat
  for (let step = current - TOTP_WINDOW; step <= current + TOTP_WINDOW; step += 1) {
    const matches = timingSafeEqual(given, Buffer.from(totpCode(secret, step)));
    if (matches && found === null && (lastUsedStep === null || step > lastUsedStep)) found = step;
  }
  return found;
}

/**
 * Adresse `otpauth://` à transformer en QR code (le site s'en chargera) ou à ouvrir sur le téléphone.
 * Libellé : « Kemdia (Équipe):<identifiant> » ; jamais le secret ailleurs que dans le paramètre prévu.
 */
export function otpauthUri(secret: Uint8Array, accountLabel: string): string {
  const issuer = "Kemdia";
  const label = encodeURIComponent(`${issuer}:${accountLabel}`);
  const params = new URLSearchParams({
    secret: base32Encode(secret),
    issuer,
    algorithm: "SHA1",
    digits: String(TOTP_DIGITS),
    period: String(TOTP_PERIOD_SECONDS),
  });
  return `otpauth://totp/${label}?${params.toString()}`;
}
