import type { OtpChannel } from "../../domain/identifier.js";
import type { OtpMessage, OtpSender } from "../../application/ports.js";
import { renderEmail, type Email } from "./email-templates.js";

/** Un service qui remet un e-mail déjà rédigé (Mailpit, Brevo…). */
export interface MailTransport {
  /** Nom affiché dans les journaux */
  readonly name: string;
  send(email: Email): Promise<void>;
}

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
