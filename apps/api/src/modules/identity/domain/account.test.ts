import { describe, expect, it } from "vitest";
import { Account, LOCK_DURATION_MS } from "./account.js";
import { requireIdentifier } from "./identifier.js";

const T0 = new Date("2026-10-07T10:00:00Z");
const at = (ms: number) => new Date(T0.getTime() + ms);

const newAccount = (identifier = "awa@exemple.ga") =>
  Account.register({
    id: "11111111-1111-4111-8111-111111111111",
    firstName: " Awa ",
    lastName: "Ndong",
    identifier: requireIdentifier(identifier),
    passwordHash: "$argon2id$…",
    now: T0,
  });

describe("Compte (FR-001)", () => {
  it("un nouveau compte attend la vérification de son identifiant (BR-041)", () => {
    const account = newAccount();
    expect(account.status).toBe("pending");
    expect(account.isVerified()).toBe(false);
    expect(account.snapshot()).toMatchObject({
      firstName: "Awa",
      email: "awa@exemple.ga",
      phone: null,
    });
  });

  it("un compte par téléphone n'a pas d'e-mail", () => {
    expect(newAccount("077123456").snapshot()).toMatchObject({
      email: null,
      phone: "+241077123456",
    });
  });

  it("refuse un nom invalide", () => {
    expect(() =>
      Account.register({
        id: "x",
        firstName: "A",
        lastName: "Ndong",
        identifier: requireIdentifier("awa@exemple.ga"),
        passwordHash: "h",
        now: T0,
      }),
    ).toThrow(expect.objectContaining({ code: "NOM_INVALIDE" }));
  });

  it("vérifié avec son propre identifiant → actif", () => {
    const account = newAccount();
    account.markVerified(requireIdentifier("AWA@exemple.ga"), at(1000));
    expect(account.status).toBe("active");
    expect(account.snapshot().emailVerifiedAt).toEqual(at(1000));
  });

  it("refuse la vérification par un autre identifiant", () => {
    expect(() => newAccount().markVerified(requireIdentifier("autre@exemple.ga"), T0)).toThrow(
      expect.objectContaining({ code: "IDENTIFIANT_INVALIDE" }),
    );
  });

  describe("BR-040 : 3 échecs → bloqué 15 minutes", () => {
    it("bloqué au 3ᵉ échec, débloqué 15 minutes plus tard", () => {
      const account = newAccount();
      account.recordFailedLogin(at(0));
      account.recordFailedLogin(at(1000));
      expect(account.isLocked(at(1000))).toBe(false);
      account.recordFailedLogin(at(2000));
      expect(account.isLocked(at(2000))).toBe(true);
      expect(account.isLocked(at(2000 + LOCK_DURATION_MS - 1))).toBe(true);
      expect(account.isLocked(at(2000 + LOCK_DURATION_MS))).toBe(false);
    });

    it("les échecs pendant le blocage ne le prolongent pas", () => {
      const account = newAccount();
      for (let i = 0; i < 3; i++) account.recordFailedLogin(at(0));
      account.recordFailedLogin(at(60_000));
      expect(account.snapshot().lockedUntil).toEqual(at(LOCK_DURATION_MS));
    });

    it("une connexion réussie remet le compteur à zéro", () => {
      const account = newAccount();
      account.recordFailedLogin(at(0));
      account.recordFailedLogin(at(0));
      account.recordSuccessfulLogin();
      account.recordFailedLogin(at(0));
      expect(account.isLocked(at(0))).toBe(false);
      expect(account.snapshot().failedLogins).toBe(1);
    });

    it("changer de mot de passe lève le blocage", () => {
      const account = newAccount();
      for (let i = 0; i < 3; i++) account.recordFailedLogin(at(0));
      account.changePassword("$argon2id$nouveau");
      expect(account.isLocked(at(0))).toBe(false);
      expect(account.passwordHash).toBe("$argon2id$nouveau");
    });
  });
});
