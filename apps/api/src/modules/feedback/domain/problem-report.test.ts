import { describe, expect, it } from "vitest";
import { changeStatus, newProblemReport, normalizePage } from "./problem-report.js";

const NOW = new Date("2026-10-24T09:00:00Z");
const base = {
  id: "11111111-1111-4111-8111-111111111111",
  accountId: "22222222-2222-4222-8222-222222222222",
  category: "bug" as const,
  device: "Chrome sur Android",
  now: NOW,
};

describe("Signalement (S8-T02)", () => {
  it("garde une description nettoyée, état « nouveau »", () => {
    const report = newProblemReport({ ...base, message: "  Le panier se vide tout seul.  " });
    expect(report).toMatchObject({
      message: "Le panier se vide tout seul.",
      status: "new",
      page: null,
    });
  });

  it("refuse une description trop courte, trop longue ou avec des caractères de contrôle", () => {
    expect(() => newProblemReport({ ...base, message: "bug" })).toThrow(/10 à 2000/);
    expect(() => newProblemReport({ ...base, message: "x".repeat(2001) })).toThrow(/10 à 2000/);
    expect(() => newProblemReport({ ...base, message: "ça plante\u0000 ici" })).toThrow(
      /interdits/,
    );
    // Retours à la ligne permis
    expect(newProblemReport({ ...base, message: "Ligne 1\nLigne 2\tok" }).message).toContain("\n");
  });

  it("page : chemin seulement, sans paramètres ni ancre ; le reste est ignoré", () => {
    expect(normalizePage("/panier?code=123456#haut")).toBe("/panier");
    expect(normalizePage("/produit/telephone-x")).toBe("/produit/telephone-x");
    expect(normalizePage("https://pirate.example/")).toBeNull();
    expect(normalizePage("//pirate.example")).toBeNull();
    expect(normalizePage("/\\pirate.example")).toBeNull();
    expect(normalizePage("/a b")).toBeNull();
    expect(normalizePage("/" + "a".repeat(250))).toBeNull();
    expect(normalizePage("")).toBeNull();
  });

  it("changer d'état note qui et quand ; le même état ne change rien", () => {
    const report = newProblemReport({ ...base, message: "Le bouton payer ne répond pas." });
    const later = new Date(NOW.getTime() + 1000);
    const next = changeStatus(report, "in_progress", "staff", later);
    expect(next).toMatchObject({ status: "in_progress", handledBy: "staff", updatedAt: later });
    expect(changeStatus(next, "in_progress", "other", later)).toBe(next);
  });
});
