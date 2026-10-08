import { createHash, randomBytes } from "node:crypto";

/**
 * Secrets remis au client (ticket d'inscription, jeton de session) : 32 octets aléatoires en base64url.
 * La base n'en garde que l'empreinte SHA-256 : une copie de la base ne permet pas de les rejouer.
 * (Un secret de 256 bits n'a pas besoin d'un hachage lent : il ne se devine pas.)
 */
export const SECRET_PATTERN = /^[A-Za-z0-9_-]{43}$/;

export function generateSecret(): string {
  return randomBytes(32).toString("base64url");
}

export function hashSecret(secret: string): string {
  return createHash("sha256").update(secret).digest("hex");
}
