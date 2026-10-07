import { describe, expect, it } from "vitest";
import { loadConfig } from "../../../config/env.js";
import { ConsoleOtpSender } from "./console-otp-sender.js";
import { EmailOtpSender } from "./email/email-otp-sender.js";
import { NoOtpSender, createOtpSender } from "./otp-sender.factory.js";

const KEY = `xkeysib-${"a".repeat(64)}-AbCdEf123456`;
const prod = { NODE_ENV: "production", APP_VERSION: "v1", DATABASE_URL: "postgresql://a:b@db/k" };

describe("choix de l'envoi des codes (EMAIL_TRANSPORT)", () => {
  it("par défaut : console sur le poste et pendant les tests", () => {
    expect(createOtpSender(loadConfig({}))).toBeInstanceOf(ConsoleOtpSender);
    expect(createOtpSender(loadConfig({ NODE_ENV: "test" }))).toBeInstanceOf(ConsoleOtpSender);
  });

  it("par défaut : AUCUN envoi en démo, préproduction ou production", () => {
    for (const APP_ENV of ["demo", "staging", "production"]) {
      const sender = createOtpSender(loadConfig({ ...prod, APP_ENV }));
      expect(sender).toBeInstanceOf(NoOtpSender);
      expect(sender.channels).toEqual([]);
    }
    expect(createOtpSender(loadConfig({ ...prod, APP_ENV: "local" }))).toBeInstanceOf(NoOtpSender);
  });

  it("Mailpit et Brevo envoient par e-mail seulement", () => {
    const mailpit = createOtpSender(loadConfig({ EMAIL_TRANSPORT: "mailpit" }));
    expect(mailpit).toBeInstanceOf(EmailOtpSender);
    expect(mailpit.channels).toEqual(["email"]);
    const brevo = createOtpSender(
      loadConfig({
        ...prod,
        APP_ENV: "demo",
        EMAIL_TRANSPORT: "brevo",
        BREVO_API_KEY: KEY,
        EMAIL_FROM: "kemdia.demo@gmail.com",
      }),
    );
    expect(brevo).toBeInstanceOf(EmailOtpSender);
  });

  it("« console » refusé dès la configuration hors du poste de développement", () => {
    expect(() => loadConfig({ ...prod, APP_ENV: "demo", EMAIL_TRANSPORT: "console" })).toThrow(
      /EMAIL_TRANSPORT/,
    );
    // Même si la configuration était contournée, la fabrique ne renvoie pas la console
    expect(
      createOtpSender({
        ...loadConfig({}),
        APP_ENV: "demo",
        NODE_ENV: "production",
        EMAIL_TRANSPORT: "console",
      }),
    ).toBeInstanceOf(NoOtpSender);
  });
});
