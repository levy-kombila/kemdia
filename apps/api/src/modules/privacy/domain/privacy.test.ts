import { describe, expect, it } from "vitest";
import { inactivityBounds, normalizeBlockers, PrivacyError } from "./privacy.js";

describe("Données personnelles : règles (S7-T08)", () => {
  it("bornes de la nuit : prévenir à 3 ans moins 30 jours, effacer 30 jours après l'avis", () => {
    const now = new Date("2026-10-19T01:00:00.000Z");
    const bounds = inactivityBounds(now);
    expect(bounds.notifyBefore.toISOString()).toBe("2023-11-18T01:00:00.000Z");
    expect(bounds.noticedBefore.toISOString()).toBe("2026-09-19T01:00:00.000Z");
    expect(bounds.deleteOn.toISOString()).toBe("2026-11-18T01:00:00.000Z");
  });

  it("empêchements : codes inconnus ignorés, sans doublon, dans un ordre fixe", () => {
    expect(
      normalizeBlockers(["COMPTE_EQUIPE", "inconnu", "COMMANDE_EN_COURS", "COMPTE_EQUIPE"]),
    ).toEqual(["COMMANDE_EN_COURS", "COMPTE_EQUIPE"]);
    expect(normalizeBlockers([])).toEqual([]);
  });

  it("message lisible par défaut", () => {
    const error = new PrivacyError("BOUTIQUE_OUVERTE");
    expect(error.code).toBe("BOUTIQUE_OUVERTE");
    expect(error.message).toMatch(/boutique/);
  });
});
