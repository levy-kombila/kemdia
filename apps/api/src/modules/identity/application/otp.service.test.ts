import { describe, expect, it } from "vitest";
import {
  FakeClock,
  InMemoryOtpChallenges,
  RecordingOtpSender,
} from "../../../../test/identity/in-memory.js";
import { requireIdentifier, type OtpChannel } from "../domain/identifier.js";
import { OTP_MAX_SENDS_PER_HOUR, OTP_RESEND_DELAY_MS, OTP_TTL_MS } from "../domain/otp.js";
import { OtpService } from "./otp.service.js";

const EMAIL = requireIdentifier("awa@exemple.ga");
const PHONE = requireIdentifier("077123456");

function setup({
  smsEnabled = false,
  channels = ["email", "sms"],
}: { smsEnabled?: boolean; channels?: readonly OtpChannel[] } = {}) {
  const challenges = new InMemoryOtpChallenges();
  const sender = new RecordingOtpSender(channels);
  const clock = new FakeClock();
  let n = 0;
  const service = new OtpService(
    challenges,
    sender,
    clock,
    { smsEnabled },
    {
      int: () => 123_456,
      uuid: () => `00000000-0000-4000-8000-${String(++n).padStart(12, "0")}`,
    },
  );
  return { service, challenges, sender, clock };
}

describe("OtpService", () => {
  it("envoie un code par e-mail ; seule son empreinte est enregistrée", async () => {
    const { service, challenges, sender } = setup();
    const issued = await service.issue("signup", EMAIL);
    expect(issued).toMatchObject({
      channel: "email",
      sentTo: "aw•••@exemple.ga",
      resendInSeconds: 60,
    });
    expect(sender.sent).toEqual([
      { channel: "email", to: "awa@exemple.ga", code: "123456", purpose: "signup" },
    ]);
    expect(JSON.stringify(challenges.rows)).not.toContain("123456");
  });

  describe("SMS « bientôt disponible »", () => {
    it("SMS_ENABLED=false : canal refusé, rien n'est envoyé", async () => {
      const { service, sender } = setup();
      expect(service.availableChannels()).toEqual(["email"]);
      await expect(service.issue("signup", PHONE)).rejects.toMatchObject({
        code: "CANAL_INDISPONIBLE",
      });
      expect(sender.sent).toEqual([]);
    });

    it("SMS_ENABLED=true mais adaptateur sans SMS : toujours refusé", async () => {
      const { service } = setup({ smsEnabled: true, channels: ["email"] });
      await expect(service.issue("signup", PHONE)).rejects.toMatchObject({
        code: "CANAL_INDISPONIBLE",
      });
    });

    it("SMS_ENABLED=true avec un adaptateur SMS : envoyé", async () => {
      const { service, sender } = setup({ smsEnabled: true });
      await service.issue("signup", PHONE);
      expect(sender.sent[0]).toMatchObject({ channel: "sms", to: "+241077123456" });
    });
  });

  it("60 s au moins entre deux envois", async () => {
    const { service, clock } = setup();
    await service.issue("signup", EMAIL);
    clock.advance(OTP_RESEND_DELAY_MS - 1000);
    await expect(service.issue("signup", EMAIL)).rejects.toMatchObject({
      code: "ENVOI_TROP_RAPPROCHE",
      message: expect.stringMatching(/1 s/),
    });
    clock.advance(1000);
    await expect(service.issue("signup", EMAIL)).resolves.toBeDefined();
  });

  it("5 envois par heure au plus vers une même adresse", async () => {
    const { service, clock } = setup();
    for (let i = 0; i < OTP_MAX_SENDS_PER_HOUR; i++) {
      await service.issue(i % 2 ? "reset" : "signup", EMAIL);
      clock.advance(OTP_RESEND_DELAY_MS);
    }
    await expect(service.issue("signup", EMAIL)).rejects.toMatchObject({ code: "TROP_D_ENVOIS" });
    await expect(
      service.issue("signup", requireIdentifier("autre@exemple.ga")),
    ).resolves.toBeDefined();
    clock.advance(60 * 60_000);
    await expect(service.issue("signup", EMAIL)).resolves.toBeDefined();
  });

  describe("vérification", () => {
    it("bon code : accepté une fois", async () => {
      const { service, sender } = setup();
      await service.issue("signup", EMAIL);
      await expect(service.verify("signup", EMAIL, sender.lastCode())).resolves.toBeUndefined();
      await expect(service.verify("signup", EMAIL, sender.lastCode())).rejects.toMatchObject({
        code: "CODE_EXPIRE",
      });
    });

    it("le code d'inscription ne sert pas à réinitialiser le mot de passe", async () => {
      const { service, sender } = setup();
      await service.issue("signup", EMAIL);
      await expect(service.verify("reset", EMAIL, sender.lastCode())).rejects.toMatchObject({
        code: "CODE_EXPIRE",
      });
    });

    it("mauvais code puis trop d'essais (5)", async () => {
      const { service, sender } = setup();
      await service.issue("signup", EMAIL);
      for (let i = 0; i < 4; i++) {
        await expect(service.verify("signup", EMAIL, "000000")).rejects.toMatchObject({
          code: "CODE_INVALIDE",
        });
      }
      await expect(service.verify("signup", EMAIL, "000000")).rejects.toMatchObject({
        code: "TROP_D_ESSAIS",
      });
      // Même le bon code est refusé ensuite : il faut en redemander un
      await expect(service.verify("signup", EMAIL, sender.lastCode())).rejects.toMatchObject({
        code: "TROP_D_ESSAIS",
      });
    });

    it("code expiré après 10 minutes", async () => {
      const { service, sender, clock } = setup();
      await service.issue("signup", EMAIL);
      clock.advance(OTP_TTL_MS);
      await expect(service.verify("signup", EMAIL, sender.lastCode())).rejects.toMatchObject({
        code: "CODE_EXPIRE",
      });
    });

    it("seul le dernier code envoyé compte", async () => {
      const challenges = new InMemoryOtpChallenges();
      const sender = new RecordingOtpSender();
      const clock = new FakeClock();
      const codes = [111_111, 222_222];
      let n = 0;
      const service = new OtpService(
        challenges,
        sender,
        clock,
        { smsEnabled: false },
        {
          int: () => codes[n] ?? 0,
          uuid: () => `00000000-0000-4000-8000-${String(++n).padStart(12, "0")}`,
        },
      );
      await service.issue("signup", EMAIL);
      clock.advance(OTP_RESEND_DELAY_MS);
      await service.issue("signup", EMAIL);
      await expect(service.verify("signup", EMAIL, "111111")).rejects.toMatchObject({
        code: "CODE_INVALIDE",
      });
      await expect(service.verify("signup", EMAIL, "222222")).resolves.toBeUndefined();
      // L'ancien code ne redevient pas valable une fois le nouveau utilisé
      await expect(service.verify("signup", EMAIL, "111111")).rejects.toMatchObject({
        code: "CODE_EXPIRE",
      });
    });
  });
});
