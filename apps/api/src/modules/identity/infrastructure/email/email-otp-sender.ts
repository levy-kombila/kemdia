import type { OtpChannel } from "../../domain/identifier.js";
import type { OtpMessage, OtpSender } from "../../application/ports.js";
import type { MailTransport } from "../../../../mail/mail-transport.js";
import { renderEmail } from "./email-templates.js";

export type { MailTransport };

/** Envoi des codes et alertes par e-mail. Le SMS n'est pas géré ici (canal refusé tant que SMS_ENABLED=false). */
export class EmailOtpSender implements OtpSender {
  readonly channels: readonly OtpChannel[] = ["email"];

  constructor(private readonly transport: MailTransport) {}

  send(message: OtpMessage): Promise<void> {
    if (message.channel !== "email") {
      return Promise.reject(
        new Error(`canal ${message.channel} non géré par ${this.transport.name}`),
      );
    }
    return this.transport.send(renderEmail(message));
  }
}
