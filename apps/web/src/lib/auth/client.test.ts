import { describe, expect, it } from "vitest";
import { createDemoAuthClient, DEMO_OTP, OTP_MAX_ATTEMPTS } from "./client";
import type { Identifier } from "./validation";

const id: Identifier = { kind: "phone", value: "+241077123456", operator: "Airtel" };

describe("adaptateur d'authentification de démonstration", () => {
  it("accepte le code de démonstration", async () => {
    const client = createDemoAuthClient(0);
    expect(await client.verifyOtp("signup", id, DEMO_OTP)).toEqual({ ok: true });
  });

  it(`bloque après ${OTP_MAX_ATTEMPTS} codes faux, puis se débloque avec un nouveau code`, async () => {
    const client = createDemoAuthClient(0);
    for (let i = 1; i < OTP_MAX_ATTEMPTS; i++) {
      expect(await client.verifyOtp("signup", id, "000000")).toEqual({
        ok: false,
        error: "invalid-code",
      });
    }
    expect(await client.verifyOtp("signup", id, "000000")).toEqual({
      ok: false,
      error: "too-many-attempts",
    });
    // même le bon code est refusé une fois la limite atteinte
    expect(await client.verifyOtp("signup", id, DEMO_OTP)).toEqual({
      ok: false,
      error: "too-many-attempts",
    });
    await client.resendOtp("signup", id);
    expect(await client.verifyOtp("signup", id, DEMO_OTP)).toEqual({ ok: true });
  });

  it("ne connecte personne tant que l'API n'existe pas", async () => {
    const client = createDemoAuthClient(0);
    expect(await client.login(id, "Libreville2026")).toEqual({ ok: false, error: "unavailable" });
  });
});
