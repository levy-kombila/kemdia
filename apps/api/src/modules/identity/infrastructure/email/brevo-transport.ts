import type { Email } from "./email-templates.js";
import type { MailTransport } from "./email-otp-sender.js";
import { postJson, type FetchLike } from "./http-mail.js";

export const BREVO_SEND_URL = "https://api.brevo.com/v3/smtp/email";

/**
 * Brevo (API HTTP, ADR-0016) : 300 e-mails par jour gratuitement, sans nom de domaine (expéditeur vérifié).
 * L'API web plutôt que SMTP : Render gratuit bloque les ports SMTP sortants.
 */
export class BrevoTransport implements MailTransport {
  readonly name = "Brevo";

  constructor(
    private readonly options: { apiKey: string; from: string; fromName: string },
    private readonly fetchImpl: FetchLike = fetch,
  ) {}

  send(email: Email): Promise<void> {
    return postJson(
      this.fetchImpl,
      this.name,
      BREVO_SEND_URL,
      { "api-key": this.options.apiKey },
      {
        sender: { email: this.options.from, name: this.options.fromName },
        to: [{ email: email.to }],
        subject: email.subject,
        htmlContent: email.html,
        textContent: email.text,
        tags: ["kemdia-identite"],
      },
      [201],
    );
  }
}
