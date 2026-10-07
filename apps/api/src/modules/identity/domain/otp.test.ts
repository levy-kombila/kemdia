import { describe, expect, it } from "vitest";
import { OTP_MAX_ATTEMPTS, OTP_TTL_MS, OtpChallenge, generateOtpCode, hashOtpCode } from "./otp.js";

const T0 = new Date("2026-10-07T10:00:00Z");
const at = (ms: number) => new Date(T0.getTime() + ms);
const ID = "22222222-2222-4222-8222-222222222222";

const challenge = () =>
  OtpChallenge.issue({
    id: ID,
    purpose: "signup",
    channel: "email",
    destination: "awa@exemple.ga",
    code: "042917",
    now: T0,
  });

describe("code à usage unique", () => {
  it("6 chiffres, zéros de tête conservés", () => {
    expect(generateOtpCode(() => 42)).toBe("000042");
    expect(generateOtpCode(() => 999_999)).toBe("999999");
  });

  it("seule l'empreinte est gardée, liée au défi", () => {
    const snap = challenge().snapshot();
    expect(JSON.stringify(snap)).not.toContain("042917");
    expect(snap.codeHash).toBe(hashOtpCode(ID, "042917"));
    expect(hashOtpCode("autre", "042917")).not.toBe(snap.codeHash);
  });

  it("le bon code est accepté une seule fois", () => {
    const c = challenge();
    expect(c.check("042917", at(1000))).toBe("ok");
    expect(c.isUsable(at(1000))).toBe(false);
    expect(c.check("042917", at(2000))).toBe("expired");
  });

  it("expire après 10 minutes", () => {
    expect(challenge().check("042917", at(OTP_TTL_MS))).toBe("expired");
    expect(challenge().check("042917", at(OTP_TTL_MS - 1))).toBe("ok");
  });

  it("5 essais au plus, même le bon code est refusé ensuite", () => {
    const c = challenge();
    for (let i = 1; i < OTP_MAX_ATTEMPTS; i++) expect(c.check("000000", T0)).toBe("invalid");
    expect(c.check("000000", T0)).toBe("too-many-attempts");
    expect(c.check("042917", T0)).toBe("too-many-attempts");
    expect(c.snapshot().attempts).toBe(OTP_MAX_ATTEMPTS);
  });

  it("refuse un code mal formé à l'émission", () => {
    expect(() =>
      OtpChallenge.issue({
        id: ID,
        purpose: "reset",
        channel: "sms",
        destination: "+241077123456",
        code: "12345",
        now: T0,
      }),
    ).toThrow(expect.objectContaining({ code: "CODE_INVALIDE" }));
  });
});
