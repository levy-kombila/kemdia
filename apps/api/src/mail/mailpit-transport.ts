import { postJson, type FetchLike } from "./http-mail.js";
import { attachmentsOf, base64, type Email, type MailTransport } from "./mail-transport.js";

/**
 * Mailpit : boîte de réception de TEST (docker compose), rien ne part sur Internet.
 * Les e-mails se lisent sur http://localhost:8025. Envoi par son API web (`POST /api/v1/send`).
 */
export class MailpitTransport implements MailTransport {
  readonly name = "Mailpit";

  constructor(
    private readonly options: { url: string; from: string; fromName: string },
    private readonly fetchImpl: FetchLike = fetch,
  ) {}

  send(email: Email): Promise<void> {
    return postJson(
      this.fetchImpl,
      this.name,
      new URL("/api/v1/send", this.options.url).href,
      {},
      {
        From: { Email: this.options.from, Name: this.options.fromName },
        To: [{ Email: email.to }],
        Subject: email.subject,
        Text: email.text,
        HTML: email.html,
        Tags: [email.tag ?? "kemdia"],
        ...(email.attachments?.length
          ? {
              Attachments: attachmentsOf(email).map((a) => ({
                Filename: a.filename,
                ContentType: a.contentType,
                Content: base64(a.content),
              })),
            }
          : {}),
      },
      [200],
    );
  }
}
