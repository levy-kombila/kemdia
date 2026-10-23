import { describe, expect, it } from "vitest";
import {
  authorNameOf,
  averageOf,
  cleanText,
  moderate,
  validateComment,
  writeReview,
  type Review,
} from "./review.js";

const NOW = new Date("2026-10-23T10:00:00.000Z");
const base = {
  id: "11111111-1111-4111-8111-111111111111",
  listingId: "22222222-2222-4222-8222-222222222222",
  accountId: "33333333-3333-4333-8333-333333333333",
  authorName: "Awa N.",
};
const code = (f: () => unknown) => {
  try {
    f();
    return "aucune erreur";
  } catch (e) {
    return (e as { code?: string }).code;
  }
};

describe("avis des clients : règles (S8-T01)", () => {
  it("note seule : publiée ; avec un commentaire : en attente", () => {
    expect(writeReview(null, { ...base, rating: 4, comment: "" }, NOW).status).toBe("published");
    const pending = writeReview(
      null,
      { ...base, rating: 5, comment: "  Très bon produit,  livré vite. " },
      NOW,
    );
    expect(pending).toMatchObject({ status: "pending", comment: "Très bon produit, livré vite." });
  });

  it("note de 1 à 5 entière ; commentaire de 10 à 1 000 caractères, nettoyé", () => {
    for (const rating of [0, 6, 3.5, "5", null]) {
      expect(code(() => writeReview(null, { ...base, rating, comment: null }, NOW))).toBe(
        "AVIS_INVALIDE",
      );
    }
    expect(code(() => validateComment("Trop court"))).toBe("aucune erreur");
    expect(code(() => validateComment("Court"))).toBe("AVIS_INVALIDE");
    expect(code(() => validateComment("x".repeat(1001)))).toBe("AVIS_INVALIDE");
    // Caractères invisibles retirés (ils ne comptent pas)
    expect(cleanText("Bon​‮produit\u0007\n\n\n\nmerci")).toBe("Bonproduit\n\nmerci");
  });

  it("modifier un avis le soumet de nouveau ; la date de création reste", () => {
    const first = writeReview(null, { ...base, rating: 3, comment: null }, NOW);
    const later = new Date("2026-10-24T10:00:00.000Z");
    const edited = writeReview(
      first,
      { ...base, id: "autre", rating: 2, comment: "Finalement décevant." },
      later,
    );
    expect(edited).toMatchObject({
      id: first.id,
      createdAt: NOW,
      updatedAt: later,
      status: "pending",
    });
  });

  it("modération : seulement un avis en attente ; un refus a un motif", () => {
    const pending = writeReview(
      null,
      { ...base, rating: 5, comment: "Excellent, je recommande." },
      NOW,
    );
    const by = { staffId: "44444444-4444-4444-8444-444444444444", reason: null, now: NOW };
    expect(moderate(pending, "publish", by).status).toBe("published");
    expect(code(() => moderate(pending, "reject", by))).toBe("AVIS_INVALIDE");
    const rejected: Review = moderate(pending, "reject", { ...by, reason: "Propos hors sujet" });
    expect(rejected).toMatchObject({ status: "rejected", rejectReason: "Propos hors sujet" });
    expect(code(() => moderate(rejected, "publish", by))).toBe("AVIS_DEJA_TRAITE");
  });

  it("nom affiché et moyenne", () => {
    expect(authorNameOf("Awa", "ndong")).toBe("Awa N.");
    expect(authorNameOf("Émile", "")).toBe("Émile");
    expect(averageOf([0, 0, 0, 0, 0])).toEqual({ count: 0, average: 0 });
    expect(averageOf([0, 0, 0, 3, 1])).toEqual({ count: 4, average: 4.3 });
  });
});
