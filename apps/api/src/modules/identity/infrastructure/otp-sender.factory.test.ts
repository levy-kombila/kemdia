import { describe, expect, it } from "vitest";
import { ConsoleOtpSender } from "./console-otp-sender.js";
import { NoOtpSender, createOtpSender } from "./otp-sender.factory.js";

describe("choix de l'envoi des codes", () => {
  it("console sur le poste de développement et pendant les tests", () => {
    expect(createOtpSender({ APP_ENV: "local", NODE_ENV: "development" })).toBeInstanceOf(
      ConsoleOtpSender,
    );
    expect(createOtpSender({ APP_ENV: "local", NODE_ENV: "test" })).toBeInstanceOf(
      ConsoleOtpSender,
    );
  });

  it("jamais de code dans les journaux en démo, préproduction ou production", () => {
    for (const APP_ENV of ["demo", "staging", "production"] as const) {
      const sender = createOtpSender({ APP_ENV, NODE_ENV: "production" });
      expect(sender).toBeInstanceOf(NoOtpSender);
      expect(sender.channels).toEqual([]);
    }
    expect(createOtpSender({ APP_ENV: "local", NODE_ENV: "production" })).toBeInstanceOf(
      NoOtpSender,
    );
  });
});
