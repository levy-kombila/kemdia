import { randomInt, randomUUID } from "node:crypto";
import { Inject, Injectable, Optional } from "@nestjs/common";
import {
  channelOf,
  maskIdentifier,
  type Identifier,
  type OtpChannel,
} from "../domain/identifier.js";
import { IdentityError } from "../domain/identity-error.js";
import {
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
  type OtpRandom,
  type OtpSender,
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
 * Envoi et vérification des codes à usage unique (BR-041, FR-012).
 * Les limites (60 s entre deux envois, 5 par heure) sont comptées dans PostgreSQL (ADR-0015).
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

  /** Canaux proposés à l'utilisateur : le SMS n'apparaît qu'avec `SMS_ENABLED=true` ET un adaptateur qui le gère. */
  availableChannels(): OtpChannel[] {
    return this.sender.channels.filter((c) => c !== "sms" || this.options.smsEnabled);
  }

  async issue(purpose: OtpPurpose, identifier: Identifier): Promise<IssuedOtp> {
    const channel = channelOf(identifier);
    if (!this.availableChannels().includes(channel)) {
      throw new IdentityError(
        "CANAL_INDISPONIBLE",
        channel === "sms"
          ? "la vérification par SMS n'est pas encore disponible : utilisez votre adresse e-mail"
          : "l'envoi de codes par e-mail n'est pas disponible pour le moment",
      );
    }

    const now = this.clock.now();
    const destination = identifier.value;
    const last = await this.challenges.lastSentAt(destination);
    if (last && now.getTime() - last.getTime() < OTP_RESEND_DELAY_MS) {
      const wait = Math.ceil((OTP_RESEND_DELAY_MS - (now.getTime() - last.getTime())) / 1000);
      throw new IdentityError("ENVOI_TROP_RAPPROCHE", `nouveau code possible dans ${wait} s`);
    }
    const sentLastHour = await this.challenges.countSentSince(
      destination,
      new Date(now.getTime() - 60 * 60_000),
    );
    if (sentLastHour >= OTP_MAX_SENDS_PER_HOUR) {
      throw new IdentityError(
        "TROP_D_ENVOIS",
        `${OTP_MAX_SENDS_PER_HOUR} codes par heure au plus : réessayez plus tard`,
      );
    }

    const code = generateOtpCode((max) => this.random.int(max));
    const challenge = OtpChallenge.issue({
      id: this.random.uuid(),
      purpose,
      channel,
      destination,
      code,
      now,
    });
    // Enregistré AVANT l'envoi : un envoi qui échoue compte quand même dans les limites (pas de rafale)
    await this.challenges.create(challenge);
    await this.sender.send({ channel, to: destination, code, purpose });

    return {
      challengeId: challenge.id,
      channel,
      sentTo: maskIdentifier(identifier),
      resendInSeconds: OTP_RESEND_DELAY_MS / 1000,
    };
  }

  /**
   * Vérifie le code du dernier défi utilisable. Lève une erreur métier sinon ;
   * aucun message ne révèle si un compte existe pour cet identifiant.
   */
  async verify(purpose: OtpPurpose, identifier: Identifier, code: string): Promise<void> {
    const now = this.clock.now();
    const challenge = await this.challenges.findLatest(identifier.value, purpose);
    if (!challenge) {
      throw new IdentityError(
        "CODE_EXPIRE",
        "code expiré ou déjà utilisé : demandez-en un nouveau",
      );
    }
    const result = challenge.check(code, now);
    // Défi déjà consommé ou expiré : rien n'a changé, rien à écrire
    if (result !== "expired") await this.challenges.save(challenge);
    switch (result) {
      case "ok":
        return;
      case "invalid":
        throw new IdentityError("CODE_INVALIDE", "code incorrect");
      case "too-many-attempts":
        throw new IdentityError("TROP_D_ESSAIS", "trop d'essais : demandez un nouveau code");
      case "expired":
        throw new IdentityError("CODE_EXPIRE", "code expiré : demandez-en un nouveau");
    }
  }
}
