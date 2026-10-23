import { describe, expect, it } from "vitest";
import { Account } from "./account.js";
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

  it("vue du titulaire : jamais le hachage du mot de passe", () => {
    const account = newAccount();
    account.markVerified(requireIdentifier("awa@exemple.ga"), T0);
    expect(account.isActive()).toBe(true);
    expect(account.view()).toEqual({
      id: "11111111-1111-4111-8111-111111111111",
      firstName: "Awa",
      lastName: "Ndong",
      email: "awa@exemple.ga",
      phone: null,
      roles: ["client"],
      avatar: null,
    });
    expect(JSON.stringify(account.view())).not.toContain("argon2");
  });

  it("rôles (S4-T06) : « client » toujours, rôles enregistrés dans un ordre fixe, inconnus ignorés", () => {
    const account = newAccount();
    const restored = Account.restore({
      ...account.snapshot(),
      roles: ["admin", "vendor", "root" as never],
    });
    expect(restored.roles).toEqual(["client", "vendor", "admin"]);
    expect(restored.adminView()).toMatchObject({
      status: "pending",
      roles: ["client", "vendor", "admin"],
    });
    expect(JSON.stringify(restored.adminView())).not.toContain("argon2");
  });

  it("changer de mot de passe", () => {
    const account = newAccount();
    account.changePassword("$argon2id$nouveau");
    expect(account.passwordHash).toBe("$argon2id$nouveau");
  });
});
