import { timingSafeEqual } from "node:crypto";

/** En-tête par lequel le serveur du site s'identifie (même valeur que dans @kemdia/contracts). */
export const INTERNAL_KEY_HEADER = "x-kemdia-internal-key";

/** Comparaison en temps constant : la durée ne révèle pas combien de caractères sont justes. */
export function isInternalKey(received: unknown, expected: string | undefined): boolean {
  if (!expected || typeof received !== "string") return false;
  const a = Buffer.from(received);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}
