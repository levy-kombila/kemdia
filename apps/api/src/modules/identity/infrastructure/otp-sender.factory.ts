import type { AppConfig } from "../../../config/env.js";
import type { OtpChannel } from "../domain/identifier.js";
import type { OtpSender } from "../application/ports.js";
import { ConsoleOtpSender } from "./console-otp-sender.js";
import { BrevoTransport } from "../../../mail/brevo-transport.js";
import { EmailOtpSender } from "./email/email-otp-sender.js";
import type { FetchLike } from "../../../mail/http-mail.js";
import { MailpitTransport } from "../../../mail/mailpit-transport.js";

/** Aucun canal : tout envoi est refusé (« CANAL_INDISPONIBLE ») au lieu de partir n'importe où. */
export class NoOtpSender implements OtpSender {
  readonly channels: readonly OtpChannel[] = [];
  send(): Promise<void> {
    return Promise.reject(new Error("aucun moyen d'envoi de codes configuré"));
  }
}

type SenderConfig = Pick<
  AppConfig,
  | "APP_ENV"
  | "NODE_ENV"
  | "EMAIL_TRANSPORT"
  | "MAILPIT_URL"
  | "BREVO_API_KEY"
  | "EMAIL_FROM"
  | "EMAIL_FROM_NAME"
>;

/**
 * Choix de l'envoi des codes (EMAIL_TRANSPORT, ADR-0016). La configuration refuse déjà « console » hors du poste ;
 * on revérifie ici : un code ne doit JAMAIS finir dans les journaux d'un serveur.
 */
export function createOtpSender(config: SenderConfig, fetchImpl: FetchLike = fetch): OtpSender {
  const from = { from: config.EMAIL_FROM, fromName: config.EMAIL_FROM_NAME };
  switch (config.EMAIL_TRANSPORT) {
    case "console":
      return config.APP_ENV === "local" && config.NODE_ENV !== "production"
        ? new ConsoleOtpSender()
        : new NoOtpSender();
    case "mailpit":
      return new EmailOtpSender(
        new MailpitTransport({ url: config.MAILPIT_URL, ...from }, fetchImpl),
      );
    case "brevo":
      return config.BREVO_API_KEY
        ? new EmailOtpSender(
            new BrevoTransport({ apiKey: config.BREVO_API_KEY, ...from }, fetchImpl),
          )
        : new NoOtpSender();
    case "none":
      return new NoOtpSender();
  }
}
