import { IdentityError } from "./identity-error.js";

/**
 * Règles du mot de passe : les mêmes que le site (S2-T01), vérifiées ici par le serveur qui seul fait foi.
 * Longueur 8 à 128, au moins une lettre et un chiffre, pas dans la liste des mots de passe les plus courants.
 * (Recommandation NIST SP 800-63B : longueur et liste de refus plutôt que des règles de composition compliquées.)
 */
export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_LENGTH = 128;

/** Mots de passe très courants (dont ceux du site) ; refusés quelle que soit la casse. */
const COMMON_PASSWORDS = new Set([
  "12345678",
  "123456789",
  "1234567890",
  "11111111",
  "00000000",
  "12341234",
  "87654321",
  "password",
  "password1",
  "password123",
  "passw0rd",
  "azerty123",
  "azertyuiop",
  "azerty1234",
  "qwerty123",
  "qwertyuiop",
  "qwerty1234",
  "motdepasse",
  "motdepasse1",
  "motdepasse123",
  "bonjour123",
  "soleil123",
  "iloveyou1",
  "abc12345",
  "abcd1234",
  "a1234567",
  "admin123",
  "welcome1",
  "kemdia123",
  "kemdia2026",
  "libreville1",
  "libreville2026",
  "gabon2024",
  "gabon2025",
  "gabon2026",
  "gabon241",
]);

export type PasswordIssue = "length" | "max" | "letter" | "digit" | "common";

export function passwordIssues(password: string): PasswordIssue[] {
  const issues: PasswordIssue[] = [];
  if (password.length < PASSWORD_MIN_LENGTH) issues.push("length");
  if (password.length > PASSWORD_MAX_LENGTH) issues.push("max");
  if (!/\p{L}/u.test(password)) issues.push("letter");
  if (!/\d/.test(password)) issues.push("digit");
  if (COMMON_PASSWORDS.has(password.toLowerCase())) issues.push("common");
  return issues;
}

const LABELS: Record<PasswordIssue, string> = {
  length: `au moins ${PASSWORD_MIN_LENGTH} caractères`,
  max: `${PASSWORD_MAX_LENGTH} caractères au plus`,
  letter: "au moins une lettre",
  digit: "au moins un chiffre",
  common: "mot de passe trop courant",
};

/** Lève une erreur listant ce qui manque (jamais le mot de passe lui-même). */
export function assertStrongPassword(password: string): void {
  const issues = passwordIssues(password);
  if (issues.length > 0) {
    throw new IdentityError(
      "MOT_DE_PASSE_FAIBLE",
      `mot de passe refusé : ${issues.map((i) => LABELS[i]).join(", ")}`,
    );
  }
}

export const NAME_MAX_LENGTH = 60;

/** Prénom ou nom : lettres (accents compris), espaces, apostrophes et tirets ; 2 à 60 caractères. */
export function normalizeName(input: string): string | null {
  const value = input.trim().replace(/\s+/g, " ");
  if (value.length < 2 || value.length > NAME_MAX_LENGTH) return null;
  return /^[\p{L}][\p{L}\p{M}' -]*$/u.test(value) ? value : null;
}
