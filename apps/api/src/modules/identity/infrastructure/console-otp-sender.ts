import { Injectable, Logger } from "@nestjs/common";
import type { OtpChannel } from "../domain/identifier.js";
import type { OtpMessage, OtpSender } from "../application/ports.js";

/**
 * Envoi « pour de faux » : le code est écrit dans le terminal de l'API. Poste de développement et tests SEULEMENT.
 * Refusé en production et sur la démo (identity.module.ts) : un code dans des journaux, c'est un compte volé.
 * L'envoi par e-mail (Mailpit en local, fournisseur gratuit sur la démo) arrive avec S4-T02.
 */
@Injectable()
export class ConsoleOtpSender implements OtpSender {
  private readonly logger = new Logger("Codes (développement)");
  readonly channels: readonly OtpChannel[] = ["email", "sms"];

  send(message: OtpMessage): Promise<void> {
    if (message.kind === "signup-alert") {
      this.logger.warn(
        `[${message.channel}] ${message.to} — alerte : inscription tentée sur un compte existant`,
      );
    } else {
      const usage = message.purpose === "signup" ? "inscription" : "mot de passe oublié";
      this.logger.warn(`[${message.channel}] ${message.to} — code ${usage} : ${message.code}`);
    }
    return Promise.resolve();
  }
}
