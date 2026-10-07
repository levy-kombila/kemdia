import { createHash, timingSafeEqual } from "node:crypto";
import type { OtpChannel } from "./identifier.js";
import { IdentityError } from "./identity-error.js";

/**
 * Code à usage unique envoyé par e-mail ou SMS (BR-041, FR-012).
 * Mêmes valeurs que le site (apps/web/src/lib/auth/client.ts) : 6 chiffres, 5 essais, 60 s entre deux envois.
 */
export const OTP_LENGTH = 6;
export const OTP_TTL_MS = 10 * 60_000;
export const OTP_MAX_ATTEMPTS = 5;
export const OTP_RESEND_DELAY_MS = 60_000;
/** Au plus 5 codes par heure vers une même adresse ou un même numéro (coût des SMS, harcèlement). */
export const OTP_MAX_SENDS_PER_HOUR = 5;

export type OtpPurpose = "signup" | "reset";

/** Code tiré au hasard, uniformément entre 000000 et 999999 (`randomInt` est cryptographique). */
export function generateOtpCode(randomInt: (max: number) => number): string {
  return String(randomInt(10 ** OTP_LENGTH)).padStart(OTP_LENGTH, "0");
}

/**
 * Empreinte d'un code : SHA-256 de « identifiant du défi : code ». Le code lui-même n'est jamais enregistré.
 * Un code ne vit que 10 minutes et 5 essais : une empreinte rapide suffit (ADR-0015).
 */
export function hashOtpCode(challengeId: string, code: string): string {
  return createHash("sha256").update(`${challengeId}:${code}`).digest("hex");
}

export interface OtpChallengeProps {
  id: string;
  purpose: OtpPurpose;
  channel: OtpChannel;
  /** Identifiant normalisé (e-mail en minuscules ou +241…) */
  destination: string;
  codeHash: string;
  attempts: number;
  expiresAt: Date;
  consumedAt: Date | null;
  createdAt: Date;
}

export type OtpCheck = "ok" | "invalid" | "expired" | "too-many-attempts";

export class OtpChallenge {
  private constructor(private props: OtpChallengeProps) {}

  static issue(input: {
    id: string;
    purpose: OtpPurpose;
    channel: OtpChannel;
    destination: string;
    code: string;
    now: Date;
  }): OtpChallenge {
    if (!new RegExp(`^\\d{${OTP_LENGTH}}$`).test(input.code)) {
      throw new IdentityError("CODE_INVALIDE", `code de ${OTP_LENGTH} chiffres attendu`);
    }
    return new OtpChallenge({
      id: input.id,
      purpose: input.purpose,
      channel: input.channel,
      destination: input.destination,
      codeHash: hashOtpCode(input.id, input.code),
      attempts: 0,
      expiresAt: new Date(input.now.getTime() + OTP_TTL_MS),
      consumedAt: null,
      createdAt: input.now,
    });
  }

  static restore(props: OtpChallengeProps): OtpChallenge {
    return new OtpChallenge({ ...props });
  }

  get id(): string {
    return this.props.id;
  }

  snapshot(): Readonly<OtpChallengeProps> {
    return { ...this.props };
  }

  isUsable(now: Date): boolean {
    return (
      this.props.consumedAt === null &&
      this.props.expiresAt > now &&
      this.props.attempts < OTP_MAX_ATTEMPTS
    );
  }

  /** État du défi à cet instant : encore utilisable, périmé (expiré ou déjà utilisé), ou essais épuisés. */
  state(now: Date): "usable" | "expired" | "too-many-attempts" {
    if (this.props.consumedAt !== null || this.props.expiresAt <= now) return "expired";
    if (this.props.attempts >= OTP_MAX_ATTEMPTS) return "too-many-attempts";
    return "usable";
  }

  /** Le code proposé est-il le bon ? Comparaison en temps constant ; ne compte pas l'essai (voir OtpService). */
  matches(code: string): boolean {
    const proposed = Buffer.from(hashOtpCode(this.props.id, code), "hex");
    const expected = Buffer.from(this.props.codeHash, "hex");
    return proposed.length === expected.length && timingSafeEqual(proposed, expected);
  }

  /**
   * Vérifie un code proposé (règle complète, en mémoire). Chaque essai compte, même le bon (il consomme alors le défi).
   * Le service, lui, compte l'essai DANS LA BASE en une seule requête : des essais simultanés ne passent pas la limite.
   * Comparaison en temps constant : la durée ne révèle rien du code.
   */
  check(code: string, now: Date): OtpCheck {
    const state = this.state(now);
    if (state !== "usable") return state;
    this.props.attempts += 1;
    if (this.matches(code)) {
      this.props.consumedAt = now;
      return "ok";
    }
    return this.props.attempts >= OTP_MAX_ATTEMPTS ? "too-many-attempts" : "invalid";
  }
}
