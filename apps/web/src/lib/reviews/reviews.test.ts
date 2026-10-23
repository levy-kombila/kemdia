import { describe, expect, it, vi } from "vitest";
import { createReviewsApi } from "./api-reviews";
import { checkReview } from "./messages";

vi.mock("server-only", () => ({}));

const TOKEN = "T".repeat(43);
const PAGE = {
  summary: { count: 1, average: 4, distribution: [0, 0, 0, 1, 0] },
  items: [],
  page: 1,
  totalPages: 1,
};
const api = (fetch: typeof globalThis.fetch, now = () => 0) =>
  createReviewsApi({ url: "https://api.test", key: "cle", timeoutMs: 1000, fetch, now });

describe("avis des clients côté site (S8-T01)", () => {
  it("formulaire : note de 1 à 5, commentaire vide ou de 10 à 1 000 caractères", () => {
    expect(checkReview("4", "")).toEqual({ ok: true, rating: 4, comment: null });
    expect(checkReview("5", "  Très bon produit.  ")).toEqual({
      ok: true,
      rating: 5,
      comment: "Très bon produit.",
    });
    expect(checkReview("0", "").ok).toBe(false);
    expect(checkReview(null, "").ok).toBe(false);
    expect(checkReview("3", "Court").ok).toBe(false);
    expect(checkReview("3", "x".repeat(1001)).ok).toBe(false);
  });

  it("avis publiés gardés 60 s ; oubliés après un changement ; adresse vérifiée", async () => {
    let time = 0;
    const fetch = vi.fn(() => Promise.resolve(Response.json(PAGE)));
    const reviews = api(fetch, () => time);
    await reviews.page("pagne-wax", 1);
    await reviews.page("pagne-wax", 1);
    expect(fetch).toHaveBeenCalledTimes(1);
    reviews.forget("pagne-wax");
    await reviews.page("pagne-wax", 1);
    expect(fetch).toHaveBeenCalledTimes(2);
    time = 61_000;
    await reviews.page("pagne-wax", 1);
    expect(fetch).toHaveBeenCalledTimes(3);
    expect(await reviews.page("../admin", 1)).toEqual({ ok: false, code: "PRODUIT_INTROUVABLE" });
    expect(fetch).toHaveBeenCalledTimes(3);
  });

  it("mon avis : session en en-tête ; achat requis rendu tel quel ; jeton mal formé jamais envoyé", async () => {
    const forbidden = vi.fn(() =>
      Promise.resolve(
        Response.json(
          { type: "about:blank", title: "x", status: 403, code: "ACHAT_REQUIS" },
          { status: 403 },
        ),
      ),
    );
    expect(await api(forbidden).write(TOKEN, "pagne-wax", { rating: 5, comment: null })).toEqual({
      ok: false,
      code: "ACHAT_REQUIS",
    });
    const [url, init] = forbidden.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.test/api/v1/products/pagne-wax/reviews/mine");
    expect(init.method).toBe("PUT");
    expect(init.headers).toMatchObject({
      authorization: `Bearer ${TOKEN}`,
      "x-kemdia-internal-key": "cle",
    });
    expect(await api(forbidden).mine("court", "pagne-wax")).toEqual({
      ok: false,
      code: "SESSION_INVALIDE",
    });
    expect(forbidden).toHaveBeenCalledTimes(1);
  });
});
