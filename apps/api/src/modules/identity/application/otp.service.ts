import { randomInt, randomUUID } from "node:crypto";
import { Inject, Injectable, Logger, Optional } from "@nestjs/common";
import {
  channelOf,
  maskIdentifier,
  parseIdentifier,
  type Identifier,
  type OtpChannel,
} from "../domain/identifier.js";
import { IdentityError } from "../domain/identity-error.js";
import {
  OTP_MAX_ATTEMPTS,
  OTP_MAX_SENDS_PER_HOUR,
  OTP_RESEND_DELAY_MS,
  OtpChallenge,
  generateOtpCode,
  type OtpPurpose,
} from "../domain/otp.js";
import {
  IDENTITY_CLOCK,
  IDENTITY_OPTIONS,
  OTP_CHALLENGE_REPOSITORY,
  OTP_RANDOM,
  OTP_SENDER,
  type Clock,
  type IdentityOptions,
  type OtpChallengeRepository,
  type OtpMessage,
  type OtpRandom,
  type OtpSender,
  type SecondFactorEvent,
} from "./ports.js";

export interface IssuedOtp {
  challengeId: string;
  channel: OtpChannel;
  /** Destination masquée, à afficher (« le•••@exemple.ga ») */
  sentTo: string;
  /** Délai avant de pouvoir redemander un code, en secondes */
  resendInSeconds: number;
}

/**
 * Ce que reçoit la destination :
 * - `code` : le code (cas normal) ;
 * - `signup-alert` : une alerte « quelqu'un a essayé de s'inscrire avec votre adresse » (compte déjà existant) ;
 * - `none` : rien (renvoi demandé sur un ticket leurre : on ne harcèle pas le vrai titulaire).
 * Dans les trois cas, un défi est créé et compte dans les limites : la réponse est la même (ADR-0016).
 */
export type OtpDelivery = "code" | "signup-alert" | "none";

const HOUR_MS = 60 * 60_000;

const expired = () =>
  new IdentityError("CODE_EXPIRE", "code expiré ou déjà utilisé : demandez-en un nouveau");
const tooManyAttempts = () =>
  new IdentityError("TROP_D_ESSAIS", "trop d'essais : demandez un nouveau code");

/**
 * Envoi et vérification des codes à usage unique (BR-041, FR-012), ADR-0015 et ADR-0016.
 *
 * - Limites d'envoi (60 s entre deux, 5 par heure, par destination ET par usage) vérifiées et enregistrées
 *   en une seule opération verrouillée : des demandes simultanées ne passent pas ensemble.
 * - Chaque essai est compté dans la base en une requête : des essais simultanés ne dépassent pas les 5 essais.
 * - L'e-mail part APRÈS la réponse : sa durée et ses échecs (fournisseur en panne, quota épuisé) ne se voient pas
 *   dans la réponse, qui reste identique qu'un compte existe ou non. Un échec est journalisé ; l'utilisateur redemande un code.
 */
@Injectable()
export class OtpService {
  constructor(
    @Inject(OTP_CHALLENGE_REPOSITORY) private readonly challenges: OtpChallengeRepository,
    @Inject(OTP_SENDER) private readonly sender: OtpSender,
    @Inject(IDENTITY_CLOCK) private readonly clock: Clock,
    @Inject(IDENTITY_OPTIONS) private readonly options: IdentityOptions,
    @Optional() @Inject(OTP_RANDOM) random?: OtpRandom,
  ) {
    this.random = random ?? { int: (max) => randomInt(max), uuid: () => randomUUID() };
  }

  private readonly random: OtpRandom;
  private readonly logger = new Logger("Codes");

  /** Canaux proposés à l'utilisateur : le SMS n'apparaît qu'avec `SMS_ENABLED=true` ET un adaptateur qui le gère. */
  availableChannels(): OtpChannel[] {
    return this.sender.channels.filter((c) => c !== "sms" || this.options.smsEnabled);
  }

  /** Lève `CANAL_INDISPONIBLE` si aucun code ne peut partir vers cet identifiant (SMS désactivé…). */
  assertChannelAvailable(identifier: Identifier): void {
    const channel = channelOf(identifier);
    if (!this.availableChannels().includes(channel)) {
      throw new IdentityError(
        "CANAL_INDISPONIBLE",
        channel === "sms"
          ? "la vérification par SMS n'est pas encore disponible : utilisez votre adresse e-mail"
          : "l'envoi de codes par e-mail n'est pas disponible pour le moment",
      );
    }
  }

  async issue(
    purpose: OtpPurpose,
    identifier: Identifier,
    delivery: OtpDelivery = "code",
  ): Promise<IssuedOtp> {
    this.assertChannelAvailable(identifier);
    const channel = channelOf(identifier);
    const now = this.clock.now();
    const code = generateOtpCode((max) => this.random.int(max));
    const challenge = OtpChallenge.issue({
      id: this.random.uuid(),
      purpose,
      channel,
      destination: identifier.value,
      code,
      now,
    });

    await this.challenges.createWithinLimits(challenge, (sent) => assertWithinLimits(sent, now));

    if (delivery === "code") {
      this.deliver({ kind: "code", channel, to: identifier.value, code, purpose }, identifier);
    } else if (delivery === "signup-alert") {
      this.deliver({ kind: "signup-alert", channel, to: identifier.value }, identifier);
    }

    return {
      challengeId: challenge.id,
      channel,
      sentTo: maskIdentifier(identifier),
      resendInSeconds: OTP_RESEND_DELAY_MS / 1000,
    };
  }

  /**
   * Vérifie le code du DERNIER défi envoyé. Lève une erreur métier sinon ;
   * aucun message ne révèle si un compte existe pour cet identifiant.
   */
  async verify(purpose: OtpPurpose, identifier: Identifier, code: string): Promise<void> {
    const now = this.clock.now();
    const challenge = await this.challenges.findLatest(identifier.value, purpose);
    if (!challenge) throw expired();
    const state = challenge.state(now);
    if (state === "expired") throw expired();
    if (state === "too-many-attempts") throw tooManyAttempts();

    // L'essai est compté AVANT la comparaison, en une requête : impossible de le contourner en parallèle
    const attempts = await this.challenges.claimAttempt(challenge.id, now);
    if (attempts === null) throw tooManyAttempts();

    if (challenge.matches(code)) {
      // Deux bons essais simultanés : un seul consomme le défi
      if (!(await this.challenges.consume(challenge.id, now))) throw expired();
      return;
    }
    if (attempts >= OTP_MAX_ATTEMPTS) throw tooManyAttempts();
    throw new IdentityError("CODE_INVALIDE", "code incorrect");
  }

  /** Avis de sécurité « votre mot de passe a été modifié » (hors limites d'envoi : il suit une action réussie). */
  notifyPasswordChanged(identifier: Identifier): void {
    const channel = channelOf(identifier);
    if (!this.availableChannels().includes(channel)) return;
    this.deliver({ kind: "password-changed", channel, to: identifier.value }, identifier);
  }

  /**
   * Confirmation de la suppression du compte (S7-T08), envoyée APRÈS l'effacement à l'ancienne adresse (lue avant).
   * `contact` : e-mail ou mobile enregistré (déjà normalisé) ; ignoré s'il n'est pas lisible.
   */
  notifyAccountDeleted(contact: string): void {
    const identifier = parseIdentifier(contact);
    if (!identifier) return;
    const channel = channelOf(identifier);
    if (!this.availableChannels().includes(channel)) return;
    this.deliver({ kind: "account-deleted", channel, to: identifier.value }, identifier);
  }

  /** Un message peut-il partir vers ce contact (e-mail ou mobile normalisé) avec les canaux configurés ? */
  canNotify(contact: string): boolean {
    const identifier = parseIdentifier(contact);
    return identifier !== null && this.availableChannels().includes(channelOf(identifier));
  }

  /** Prévenance 30 jours avant l'effacement d'un compte inactif (S7-T08). */
  notifyInactivity(contact: string, deleteOn: Date): void {
    const identifier = parseIdentifier(contact);
    if (!identifier) return;
    const channel = channelOf(identifier);
    if (!this.availableChannels().includes(channel)) return;
    this.deliver(
      { kind: "inactivity-warning", deleteOn, channel, to: identifier.value },
      identifier,
    );
  }

  /** Connexion depuis un appareil inconnu (S7.5-T04). `contact` : e-mail ou mobile vérifié, déjà normalisé. */
  notifyNewDevice(
    contact: string,
    notice: { device: string; at: Date; link: string | null },
  ): void {
    const identifier = parseIdentifier(contact);
    if (!identifier) return;
    const channel = channelOf(identifier);
    if (!this.availableChannels().includes(channel)) return;
    this.deliver({ kind: "new-device", ...notice, channel, to: identifier.value }, identifier);
  }

  /** Avis de sécurité de la double authentification (S6-T03) : activation, nouveaux codes, blocage, remise à zéro. */
  notifySecondFactor(identifier: Identifier, event: SecondFactorEvent): void {
    const channel = channelOf(identifier);
    if (!this.availableChannels().includes(channel)) return;
    this.deliver({ kind: "second-factor", event, channel, to: identifier.value }, identifier);
  }

  /** Envoi en arrière-plan ; un échec est journalisé (sans clé ni contenu), jamais renvoyé à l'appelant. */
  private deliver(message: OtpMessage, identifier: Identifier): void {
    let sending: Promise<void>;
    try {
      sending = this.sender.send(message);
    } catch (error) {
      sending = Promise.reject(error instanceof Error ? error : new Error(String(error)));
    }
    sending.catch((error: unknown) => {
      this.logger.warn(
        `envoi ${message.channel} vers ${maskIdentifier(identifier)} impossible : ${describe(error)}`,
      );
    });
  }
}

/** Règles d'envoi : 60 s depuis le dernier code, 5 codes au plus sur l'heure écoulée. */
function assertWithinLimits(sent: Date[], now: Date): void {
  const times = sent.map((d) => d.getTime());
  const last = times.length ? Math.max(...times) : null;
  if (last !== null && now.getTime() - last < OTP_RESEND_DELAY_MS) {
    const wait = Math.ceil((OTP_RESEND_DELAY_MS - (now.getTime() - last)) / 1000);
    throw new IdentityError("ENVOI_TROP_RAPPROCHE", `nouveau code possible dans ${wait} s`, wait);
  }
  const lastHour = times.filter((t) => t > now.getTime() - HOUR_MS);
  if (lastHour.length >= OTP_MAX_SENDS_PER_HOUR) {
    // Possible de nouveau quand le plus ancien envoi de l'heure écoulée sort de la fenêtre
    const wait = Math.max(1, Math.ceil((Math.min(...lastHour) + HOUR_MS - now.getTime()) / 1000));
    throw new IdentityError(
      "TROP_D_ENVOIS",
      `${OTP_MAX_SENDS_PER_HOUR} codes par heure au plus : réessayez dans ${Math.ceil(wait / 60)} min`,
      wait,
    );
  }
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message.slice(0, 200) : "erreur inconnue";
}
