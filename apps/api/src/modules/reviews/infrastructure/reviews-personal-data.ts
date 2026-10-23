import { Inject, Injectable } from "@nestjs/common";
import { averageOf } from "../domain/review.js";
import {
  REVIEW_LISTINGS,
  REVIEW_REPOSITORY,
  type ReviewListings,
  type ReviewRepository,
} from "../application/ports.js";

/**
 * Données personnelles du module reviews (S8-T01, ADR-0047) : copie des avis du titulaire et effacement, dans la
 * transaction partagée du module privacy. Effacer un compte retire ses avis et recalcule la note des fiches touchées.
 */
@Injectable()
export class ReviewsPersonalData {
  constructor(
    @Inject(REVIEW_REPOSITORY) private readonly reviews: ReviewRepository,
    @Inject(REVIEW_LISTINGS) private readonly listings: ReviewListings,
  ) {}

  async export(accountId: string): Promise<Record<string, unknown>[]> {
    const mine = await this.reviews.ofAccount(accountId);
    const titles = await this.listings.describe([...new Set(mine.map((r) => r.listingId))]);
    return mine.map((r) => ({
      produit: titles.get(r.listingId)?.title ?? null,
      note: r.rating,
      commentaire: r.comment,
      nomAffiche: r.authorName,
      etat: r.status,
      motifDuRefus: r.rejectReason,
      ecritLe: r.createdAt,
      modifieLe: r.updatedAt,
    }));
  }

  async erase(accountId: string): Promise<void> {
    const listingIds = await this.reviews.deleteOfAccount(accountId);
    // L'une après l'autre : une transaction n'exécute qu'une requête à la fois
    for (const listingId of listingIds) {
      const { count, average } = averageOf((await this.reviews.summary(listingId)).distribution);
      await this.listings.setRating(listingId, average, count);
    }
  }
}
