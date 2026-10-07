import type { AppConfig } from "../../../config/env.js";
import type { OtpChannel } from "../domain/identifier.js";
import type { OtpSender } from "../application/ports.js";
import { ConsoleOtpSender } from "./console-otp-sender.js";

/** Aucun canal : tout envoi est refusé (« CANAL_INDISPONIBLE ») au lieu de partir n'importe où. */
export class NoOtpSender implements OtpSender {
  readonly channels: readonly OtpChannel[] = [];
  send(): Promise<void> {
    return Promise.reject(new Error("aucun moyen d'envoi de codes configuré"));
  }
}

/**
 * Choix de l'adaptateur d'envoi des codes.
 * - Poste de développement et tests (APP_ENV=local, NODE_ENV≠production) : codes écrits dans le terminal.
 * - Partout ailleurs (démo, préproduction, production) : jamais la console. Tant que l'adaptateur e-mail
 *   (S4-T02) n'est pas branché, aucun envoi n'est possible ; le SMS attend le choix du client.
 */
export function createOtpSender(config: Pick<AppConfig, "APP_ENV" | "NODE_ENV">): OtpSender {
  if (config.APP_ENV === "local" && config.NODE_ENV !== "production") return new ConsoleOtpSender();
  return new NoOtpSender();
}
