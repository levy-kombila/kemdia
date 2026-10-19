/**
 * Validation des formulaires d'identité (S2-T01).
 * Ces contrôles servent au confort de l'utilisateur (message immédiat) ;
 * le serveur refera TOUTES ces vérifications au Sprint 4 (ne jamais faire confiance au navigateur).
 */

export type Identifier =
  { kind: "email"; value: string } | { kind: "phone"; value: string; operator: MobileOperator };

export type MobileOperator = "Airtel" | "Moov";

export const EMAIL_MAX_LENGTH = 254;
export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_LENGTH = 128;
export const NAME_MAX_LENGTH = 60;
export const OTP_LENGTH = 6;

// Volontairement simple : la vraie preuve qu'un e-mail existe, c'est le code OTP reçu.
const EMAIL_RE = /^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/;

export function normalizeEmail(input: string): string | null {
  const value = input.trim().toLowerCase();
  if (value.length === 0 || value.length > EMAIL_MAX_LENGTH) return null;
  return EMAIL_RE.test(value) ? value : null;
}

/**
 * Numéros mobiles gabonais : 9 chiffres commençant par 06 (Moov) ou 07 (Airtel), ex. 077 12 34 56.
 * Formats acceptés : « 077123456 », « 077 12 34 56 », « +241 77 12 34 56 », « 00241 077 12 34 56 ».
 * Forme normalisée : « +241077123456 » — à confirmer avec le fournisseur SMS au Sprint 4.
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

/** Affichage lisible : +241077123456 → « 077 12 34 56 ». */
export function formatGabonPhone(normalized: string): string {
  const d = normalized.replace(/^\+241/, "");
  return `${d.slice(0, 3)} ${d.slice(3, 5)} ${d.slice(5, 7)} ${d.slice(7, 9)}`;
}

/** Un seul champ « e-mail ou téléphone » (FR-004). */
export function parseIdentifier(input: string): Identifier | null {
  if (input.includes("@")) {
    const email = normalizeEmail(input);
    return email ? { kind: "email", value: email } : null;
  }
  const phone = normalizeGabonPhone(input);
  return phone ? { kind: "phone", ...phone } : null;
}

export function maskIdentifier(id: Identifier): string {
  if (id.kind === "phone") {
    const f = formatGabonPhone(id.value);
    return `${f.slice(0, 3)} •• •• ${f.slice(-2)}`;
  }
  const [local, domain] = id.value.split("@");
  return `${local!.slice(0, 2)}•••@${domain}`;
}

// Petite liste pour prévenir tout de suite ; l'API, qui seule fait foi, refuse les 10 000 plus courants (S7-T07).
const COMMON_PASSWORDS = new Set([
  "12345678",
  "123456789",
  "1234567890",
  "password",
  "password1",
  "azerty123",
  "azertyuiop",
  "motdepasse",
  "motdepasse1",
  "qwerty123",
  "kemdia123",
  "gabon2024",
  "gabon2025",
  "gabon2026",
]);

// Aucune règle de composition (lettre, chiffre…) depuis le S7-T07 : OWASP ASVS 5.0 V6.2.5, NIST SP 800-63B.
export type PasswordIssue = "length" | "max" | "common";

export function passwordIssues(password: string): PasswordIssue[] {
  const issues: PasswordIssue[] = [];
  if (password.length < PASSWORD_MIN_LENGTH) issues.push("length");
  if (password.length > PASSWORD_MAX_LENGTH) issues.push("max");
  if (COMMON_PASSWORDS.has(password.toLowerCase())) issues.push("common");
  return issues;
}

export const PASSWORD_RULES: { issue: PasswordIssue; label: string }[] = [
  { issue: "length", label: `Au moins ${PASSWORD_MIN_LENGTH} caractères` },
];

export function normalizeName(input: string): string | null {
  const value = input.trim().replace(/\s+/g, " ");
  if (value.length < 2 || value.length > NAME_MAX_LENGTH) return null;
  // Lettres (accents compris), espaces, apostrophes et tirets : « N'Dong », « Mba-Obame »
  return /^[\p{L}][\p{L}\p{M}' -]*$/u.test(value) ? value : null;
}

export function isValidOtp(code: string): boolean {
  return new RegExp(`^\\d{${OTP_LENGTH}}$`).test(code);
}
