import { Inject, Injectable } from "@nestjs/common";
import { TransactionContext } from "../../../database/transaction-context.js";
import { averageOf } from "../domain/review.js";
import {
  REVIEW_LISTINGS,
  REVIEW_REPOSITORY,
  type ReviewListings,
  type ReviewRepository,
} from "../application/ports.js";

/**
 * Fusion de deux fiches (S7.5-T02) côté avis (relecture de sécurité S8-T01) : les avis de la fiche fusionnée
 * rejoignent la fiche cible. Un client qui avait un avis sur les deux garde le plus récent (un avis par client et
 * par fiche). Les deux notes sont recalculées. Appelé dans la transaction de la fusion.
 */
@Injectable()
export class ReviewsListingMerge {
  constructor(
    private readonly tx: TransactionContext,
    @Inject(REVIEW_REPOSITORY) private readonly reviews: ReviewRepository,
    @Inject(REVIEW_LISTINGS) private readonly listings: ReviewListings,
  ) {}

  async moveReviews(sourceId: string, targetId: string): Promise<void> {
    if (sourceId === targetId) return;
    // Toujours le même ordre de verrous (identifiant croissant) : pas d'interblocage
    for (const id of [sourceId, targetId].sort()) await this.listings.lock(id);
    await this.tx.db.$executeRaw`
      DELETE FROM "reviews"."reviews" AS s USING "reviews"."reviews" AS t
      WHERE s."listing_id" = ${sourceId}::uuid AND t."listing_id" = ${targetId}::uuid
        AND s."account_id" = t."account_id" AND s."updated_at" <= t."updated_at"`;
    await this.tx.db.$executeRaw`
      DELETE FROM "reviews"."reviews" AS t USING "reviews"."reviews" AS s
      WHERE t."listing_id" = ${targetId}::uuid AND s."listing_id" = ${sourceId}::uuid
        AND s."account_id" = t."account_id"`;
    await this.tx.db.$executeRaw`
      UPDATE "reviews"."reviews" SET "listing_id" = ${targetId}::uuid
      WHERE "listing_id" = ${sourceId}::uuid`;
    for (const id of [sourceId, targetId]) {
      const { count, average } = averageOf((await this.reviews.summary(id)).distribution);
      await this.listings.setRating(id, average, count);
    }
  }
}
