import { IdentityError } from "./identity-error.js";

/**
 * Identifiant de connexion (FR-004) : une adresse e-mail OU un numéro mobile gabonais, sous forme normalisée.
 * Même logique que le site (apps/web/src/lib/auth/validation.ts) : le site aide l'utilisateur,
 * le serveur décide (test d'alignement : test/identity-alignment.test.ts).
 */
export type MobileOperator = "Airtel" | "Moov";

export type Identifier =
  { kind: "email"; value: string } | { kind: "phone"; value: string; operator: MobileOperator };

export const EMAIL_MAX_LENGTH = 254;

// Volontairement simple : la vraie preuve qu'une adresse existe, c'est le code reçu.
const EMAIL_RE = /^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/;

export function normalizeEmail(input: string): string | null {
  const value = input.trim().toLowerCase();
  if (value.length === 0 || value.length > EMAIL_MAX_LENGTH) return null;
  return EMAIL_RE.test(value) ? value : null;
}

/**
 * Mobiles gabonais : 9 chiffres commençant par 06 (Moov) ou 07 (Airtel).
 * Acceptés : « 077123456 », « 077 12 34 56 », « +241 77 12 34 56 », « 00241 077 12 34 56 ».
 * Forme enregistrée : « +241077123456 ».
 */
export function normalizeGabonPhone(
  input: string,
): { value: string; operator: MobileOperator } | null {
  let digits = input.trim().replace(/[\s.\-()]/g, "");
  if (digits.startsWith("+241")) digits = digits.slice(4);
  else if (digits.startsWith("00241")) digits = digits.slice(5);
  if (!/^\d+$/.test(digits)) return null;
  if (!digits.startsWith("0")) digits = `0${digits}`;
  if (!/^0[67]\d{7}$/.test(digits)) return null;
  return { value: `+241${digits}`, operator: digits[1] === "6" ? "Moov" : "Airtel" };
}

/** Un seul champ « e-mail ou téléphone ». `null` si ni l'un ni l'autre. */
export function parseIdentifier(input: string): Identifier | null {
  if (input.length > EMAIL_MAX_LENGTH + 10) return null;
  if (input.includes("@")) {
    const email = normalizeEmail(input);
    return email ? { kind: "email", value: email } : null;
  }
  const phone = normalizeGabonPhone(input);
  return phone ? { kind: "phone", ...phone } : null;
}

/** Comme `parseIdentifier`, mais lève une erreur métier (sans recopier la valeur reçue). */
export function requireIdentifier(input: string): Identifier {
  const identifier = parseIdentifier(input);
  if (!identifier) {
    throw new IdentityError(
      "IDENTIFIANT_INVALIDE",
      "adresse e-mail ou numéro mobile gabonais (06… ou 07…) attendu",
    );
  }
  return identifier;
}

/** Canal par lequel un code peut être envoyé à cet identifiant. */
export type OtpChannel = "email" | "sms";

export function channelOf(identifier: Identifier): OtpChannel {
  return identifier.kind === "email" ? "email" : "sms";
}

/** Version masquée pour les journaux et les messages : « le•••@exemple.ga », « 077 •• •• 56 ». */
export function maskIdentifier(identifier: Identifier): string {
  if (identifier.kind === "phone") {
    const d = identifier.value.replace(/^\+241/, "");
    return `${d.slice(0, 3)} •• •• ${d.slice(-2)}`;
  }
  const [local = "", domain = ""] = identifier.value.split("@");
  return `${local.slice(0, 2)}•••@${domain}`;
}
