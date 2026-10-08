import { IDENTITY_ERROR_CODES } from "@kemdia/contracts/constants";
import { describe, expect, it } from "vitest";
import { authErrorMessage, formatWait } from "./messages";

describe("messages d'erreur d'identité", () => {
  it("chaque code du contrat a un message en français", () => {
    for (const code of [...IDENTITY_ERROR_CODES, "INDISPONIBLE" as const])
      expect(authErrorMessage({ code })).toMatch(/\S/);
  });

  it("le message de connexion est neutre (même texte, compte ou pas)", () => {
    expect(authErrorMessage({ code: "IDENTIFIANTS_INCORRECTS" })).toBe(
      "Identifiant ou mot de passe incorrect.",
    );
  });

  it("délais lisibles", () => {
    expect(formatWait(900)).toBe("15 minutes");
    expect(formatWait(61)).toBe("2 minutes");
    expect(formatWait(45)).toBe("45 secondes");
    expect(authErrorMessage({ code: "COMPTE_BLOQUE", retryAfterSeconds: 900 })).toMatch(
      /Réessayez dans 15 minutes/,
    );
    expect(authErrorMessage({ code: "ENVOI_TROP_RAPPROCHE", retryAfterSeconds: 42 })).toBe(
      "Un code vient d'être envoyé. Nouveau code possible dans 42 secondes.",
    );
  });
});
