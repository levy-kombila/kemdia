import { Logger } from "@nestjs/common";
import type { AppConfig } from "../config/env.js";
import { BrevoTransport } from "./brevo-transport.js";
import type { FetchLike } from "./http-mail.js";
import { MailpitTransport } from "./mailpit-transport.js";
import type { Email, MailTransport } from "./mail-transport.js";

/**
 * Poste de développement (`EMAIL_TRANSPORT=console`) : l'e-mail n'est pas envoyé, le journal dit seulement qu'il
 * existe (sujet et pièces jointes, jamais le destinataire ni le contenu).
 */
export class ConsoleMailTransport implements MailTransport {
  readonly name = "console";
  private readonly logger = new Logger("E-mail (console)");

  send(email: Email): Promise<void> {
    const files = (email.attachments ?? []).map((a) => a.filename).join(", ");
    this.logger.log(`« ${email.subject} »${files ? ` — pièces jointes : ${files}` : ""}`);
    return Promise.resolve();
  }
}

type MailConfig = Pick<
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
 * Transport des e-mails autres que les codes d'identité (factures, S5-T06), avec la MÊME configuration
 * (`EMAIL_TRANSPORT`, ADR-0016) : aucune nouvelle variable. `null` : aucun envoi possible (les e-mails attendent).
 */
export function createMailTransport(
  config: MailConfig,
  fetchImpl: FetchLike = fetch,
): MailTransport | null {
  const from = { from: config.EMAIL_FROM, fromName: config.EMAIL_FROM_NAME };
  switch (config.EMAIL_TRANSPORT) {
    case "console":
      return config.APP_ENV === "local" && config.NODE_ENV !== "production"
        ? new ConsoleMailTransport()
        : null;
    case "mailpit":
      return new MailpitTransport({ url: config.MAILPIT_URL, ...from }, fetchImpl);
    case "brevo":
      return config.BREVO_API_KEY
        ? new BrevoTransport({ apiKey: config.BREVO_API_KEY, ...from }, fetchImpl)
        : null;
    case "none":
      return null;
  }
}
