import { describe, expect, it } from "vitest";
import type { Review, ReviewStatus, ReviewSummary } from "../domain/review.js";
import type { ReviewCursor, ReviewRepository } from "./ports.js";
import { ReviewService } from "./review.service.js";

const LISTING = "22222222-2222-4222-8222-222222222222";
const AWA = {
  accountId: "33333333-3333-4333-8333-333333333333",
  firstName: "Awa",
  lastName: "Ndong",
};
const STAFF = "44444444-4444-4444-8444-444444444444";
const CTX = { ip: "203.0.113.7", requestId: "r" };

class Memory implements ReviewRepository {
  rows = new Map<string, Review>();
  findMine(listingId: string, accountId: string) {
    return Promise.resolve(
      [...this.rows.values()].find((r) => r.listingId === listingId && r.accountId === accountId) ??
        null,
    );
  }
  lockById(id: string) {
    return Promise.resolve([...this.rows.values()].find((r) => r.id === id) ?? null);
  }
  save(review: Review) {
    this.rows.set(`${review.listingId}:${review.accountId}`, review);
    return Promise.resolve();
  }
  delete(listingId: string, accountId: string) {
    return Promise.resolve(this.rows.delete(`${listingId}:${accountId}`));
  }
  published(listingId: string) {
    const items = [...this.rows.values()].filter(
      (r) => r.listingId === listingId && r.status === "published",
    );
    return Promise.resolve({ items, total: items.length });
  }
  summary(listingId: string): Promise<ReviewSummary> {
    const d: [number, number, number, number, number] = [0, 0, 0, 0, 0];
    for (const r of this.rows.values())
      if (r.listingId === listingId && r.status === "published") d[r.rating - 1]!++;
    const count = d.reduce((s, n) => s + n, 0);
    return Promise.resolve({ count, average: 0, distribution: d });
  }
  list(query: { status: ReviewStatus; limit: number; after?: ReviewCursor | undefined }) {
    return Promise.resolve({
      items: [...this.rows.values()].filter((r) => r.status === query.status),
      next: null,
    });
  }
  ofAccount() {
    return Promise.resolve([]);
  }
  deleteOfAccount() {
    return Promise.resolve([]);
  }
}

function setup(bought = true) {
  const repo = new Memory();
  const ratings: [string, number, number][] = [];
  const audit: { action: string }[] = [];
  let ids = 0;
  const service = new ReviewService(
    repo,
    {
      findPublished: (slug) =>
        Promise.resolve(
          slug === "pagne" ? { listingId: LISTING, title: "Pagne", offerIds: ["o1"] } : null,
        ),
      describe: () => Promise.resolve(new Map([[LISTING, { title: "Pagne", slug: "pagne" }]])),
      setRating: (id, avg, count) => Promise.resolve(void ratings.push([id, avg, count])),
    },
    { hasDelivered: () => Promise.resolve(bought) },
    { run: (work) => work() },
    { uuid: () => `00000000-0000-4000-8000-${String(++ids).padStart(12, "0")}` },
    { record: (entry) => Promise.resolve(void audit.push(entry)) },
  );
  service.clock = () => new Date("2026-10-23T10:00:00.000Z");
  return { service, repo, ratings, audit };
}
const codeOf = (p: Promise<unknown>) =>
  p.then(
    () => "aucune erreur",
    (e: { code?: string }) => e.code,
  );

describe("ReviewService (S8-T01)", () => {
  it("achat livré obligatoire ; fiche inconnue", async () => {
    expect(await codeOf(setup(false).service.write("pagne", AWA, { rating: 5 }))).toBe(
      "ACHAT_REQUIS",
    );
    expect(await codeOf(setup().service.write("inconnue", AWA, { rating: 5 }))).toBe(
      "PRODUIT_INTROUVABLE",
    );
    expect(await setup(false).service.mine("pagne", AWA.accountId)).toEqual({
      canReview: false,
      review: null,
    });
  });

  it("note seule publiée : note de la fiche recalculée ; commentaire en attente : pas compté", async () => {
    const { service, ratings } = setup();
    const review = await service.write("pagne", AWA, { rating: 4 });
    expect(review).toMatchObject({ status: "published", authorName: "Awa N." });
    expect(ratings.at(-1)).toEqual([LISTING, 4, 1]);
    await service.write("pagne", AWA, {
      rating: 2,
      comment: "Couleurs moins vives que sur la photo.",
    });
    expect(ratings.at(-1)).toEqual([LISTING, 0, 0]);
  });

  it("modération : publier compte la note et trace ; un second avis du même compte remplace le premier", async () => {
    const { service, repo, ratings, audit } = setup();
    const review = await service.write("pagne", AWA, {
      rating: 5,
      comment: "Excellent, je recommande.",
    });
    expect(repo.rows.size).toBe(1);
    const published = await service.decide(STAFF, review.id, "publish", null, CTX);
    expect(published.status).toBe("published");
    expect(ratings.at(-1)).toEqual([LISTING, 5, 1]);
    expect(audit.map((a) => a.action)).toEqual(["review.published"]);
    expect(await codeOf(service.decide(STAFF, review.id, "reject", "Hors sujet", CTX))).toBe(
      "AVIS_DEJA_TRAITE",
    );
    await service.write("pagne", AWA, { rating: 3 });
    expect(repo.rows.size).toBe(1);
  });

  it("retrait : note recalculée ; rien à retirer → AVIS_INTROUVABLE", async () => {
    const { service, ratings } = setup();
    await service.write("pagne", AWA, { rating: 4 });
    await service.remove("pagne", AWA.accountId);
    expect(ratings.at(-1)).toEqual([LISTING, 0, 0]);
    expect(await codeOf(service.remove("pagne", AWA.accountId))).toBe("AVIS_INTROUVABLE");
  });

  it("page publique : seulement les avis publiés", async () => {
    const { service } = setup();
    await service.write("pagne", AWA, { rating: 5, comment: "Excellent, je recommande." });
    const page = await service.page("pagne", "1");
    expect(page.items).toEqual([]);
    expect(page.summary.count).toBe(0);
  });
});
