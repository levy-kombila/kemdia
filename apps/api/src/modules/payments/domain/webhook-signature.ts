import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Signature des notifications de l'opérateur (S5-T05, ADR-0027) — TypeScript pur (cryptographie de Node seulement).
 *
 * En-tête : `t=<secondes Unix>,v1=<HMAC-SHA256 hexadécimal>`, calculé sur `<t>.<corps brut>` avec la clé partagée.
 * L'horodatage est signé avec le corps : une notification interceptée ne peut pas être rejouée plus tard en changeant
 * sa date. Comparaison en temps constant.
 */
export const SIGNATURE_VERSION = "v1";
/** 5 minutes (choix du 2026-10-11). */
export const SIGNATURE_TOLERANCE_SECONDS = 300;
/** Clé d'au moins 32 octets (256 bits). */
export const MIN_SECRET_BYTES = 32;

const HEADER = /^t=(\d{1,12}),v1=([0-9a-f]{64})$/;

function mac(secret: Uint8Array, timestamp: number, body: Uint8Array | string): Buffer {
  return createHmac("sha256", secret).update(`${timestamp}.`).update(body).digest();
}

/** Valeur de l'en-tête pour ce corps, signé à `timestamp` (secondes Unix). */
export function signNotification(
  secret: Uint8Array,
  timestamp: number,
  body: Uint8Array | string,
): string {
  return `t=${timestamp},${SIGNATURE_VERSION}=${mac(secret, timestamp, body).toString("hex")}`;
}

export type SignatureCheck = "ok" | "invalide" | "expiree";

/**
 * Vérifie l'en-tête. `invalide` : absent, mal formé ou faux (on ne dit pas lequel) ; `expiree` : authentique, mais
 * signé hors de la fenêtre de tolérance (rejeu tardif ou horloge déréglée).
 */
export function verifyNotification(
  header: string | undefined,
  body: Uint8Array | string,
  secret: Uint8Array,
  nowSeconds: number,
  toleranceSeconds = SIGNATURE_TOLERANCE_SECONDS,
): SignatureCheck {
  if (secret.length < MIN_SECRET_BYTES || typeof header !== "string" || header.length > 200) {
    return "invalide";
  }
  const match = HEADER.exec(header.trim());
  if (!match) return "invalide";
  const timestamp = Number(match[1]);
  const expected = mac(secret, timestamp, body);
  const given = Buffer.from(match[2]!, "hex");
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return "invalide";
  if (Math.abs(nowSeconds - timestamp) > toleranceSeconds) return "expiree";
  return "ok";
}
