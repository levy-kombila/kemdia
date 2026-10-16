import { createHash, randomInt } from "node:crypto";
import { hasRole, type Role } from "./role.js";

/**
 * Double authentification de l'équipe (MED-15, S6-T03, ADR-0034).
 *
 * - Obligatoire pour les comptes qui ont le droit `moderator` (modérateurs et administrateurs).
 * - Une route d'équipe exige une session CONFIRMÉE par un code il y a moins de 15 minutes (remplace la « connexion
 *   récente » de l'ADR-0020) : une session volée ne suffit plus sans le téléphone.
 * - 10 codes de secours à usage unique, donnés une seule fois ; la base n'en garde que l'empreinte SHA-256.
 */
export const SECOND_FACTOR_RECENT_MS = 15 * 60_000;
export const RECOVERY_CODE_COUNT = 10;

/**
 * Échecs comptés sur 24 heures, en plus des 3 essais par 15 minutes (relecture de sécurité S6-T03) : un voleur de
 * session qui essaie 2 codes par quart d'heure atteint ce seuil en un jour. Alors TOUTES les sessions du compte sont
 * fermées et le titulaire est prévenu. Une réussite ne remet pas ce compteur à zéro.
 */
export const DAILY_MAX_FAILURES = 10;
export const FAILURE_WINDOW_MS = 24 * 60 * 60_000;

/** La 2FA est-elle obligatoire pour ces rôles ? (un administrateur a aussi les droits d'un modérateur) */
export function requiresSecondFactor(roles: readonly Role[]): boolean {
  return hasRole(roles, "moderator");
}

/** La session a-t-elle été confirmée par un code il y a moins de 15 minutes ? */
export function isSecondFactorRecent(verifiedAt: Date | null, now: Date): boolean {
  if (!verifiedAt) return false;
  const age = now.getTime() - verifiedAt.getTime();
  return age >= 0 && age < SECOND_FACTOR_RECENT_MS;
}

/** Fin de la confirmation (renvoyée au site pour qu'il sache quand redemander un code). */
export function secondFactorExpiry(verifiedAt: Date): Date {
  return new Date(verifiedAt.getTime() + SECOND_FACTOR_RECENT_MS);
}

// Sans 0/O, 1/l/i : un code de secours se recopie depuis un papier sans hésitation
const RECOVERY_ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789";
const RECOVERY_LENGTH = 12;
export const RECOVERY_CODE_PATTERN = /^[a-z2-9]{4}-[a-z2-9]{4}-[a-z2-9]{4}$/;

/** Un code de secours : 12 caractères (≈ 59 bits), présentés « abcd-efgh-jkmn ». */
export function generateRecoveryCode(): string {
  let raw = "";
  for (let i = 0; i < RECOVERY_LENGTH; i += 1) {
    raw += RECOVERY_ALPHABET[randomInt(RECOVERY_ALPHABET.length)];
  }
  return `${raw.slice(0, 4)}-${raw.slice(4, 8)}-${raw.slice(8)}`;
}

/** Forme saisie tolérée (majuscules, espaces, tirets oubliés) ramenée à la forme d'origine, ou `null`. */
export function normalizeRecoveryCode(input: string): string | null {
  const raw = input.toLowerCase().replace(/[\s-]/g, "");
  if (raw.length !== RECOVERY_LENGTH) return null;
  const code = `${raw.slice(0, 4)}-${raw.slice(4, 8)}-${raw.slice(8)}`;
  return RECOVERY_CODE_PATTERN.test(code) ? code : null;
}

/**
 * Empreinte d'un code de secours, liée au compte : la même empreinte ne sert pas pour un autre compte.
 * (59 bits aléatoires et 3 essais par 15 minutes : un hachage lent n'apporterait rien.)
 */
export function hashRecoveryCode(accountId: string, code: string): string {
  return createHash("sha256").update(`${accountId.toLowerCase()}:${code}`).digest("hex");
}
