import { Inject, Injectable } from "@nestjs/common";
import { AuditLog, type AuditContext } from "../../audit/index.js";
import {
  authorNameOf,
  averageOf,
  moderate,
  writeReview,
  type Review,
  type ReviewDecision,
  type ReviewStatus,
  type ReviewSummary,
} from "../domain/review.js";
import { ReviewsError } from "../domain/reviews-error.js";
import {
  REVIEWS_RANDOM,
  REVIEWS_TRANSACTION,
  REVIEW_LISTINGS,
  REVIEW_PURCHASES,
  REVIEW_REPOSITORY,
  type ReviewCursor,
  type ReviewListings,
  type ReviewPurchases,
  type ReviewRepository,
  type ReviewsRandom,
  type ReviewsTransaction,
} from "./ports.js";

/** Avis publiés par page sur la fiche produit. */
export const REVIEWS_PAGE_SIZE = 10;
const MAX_PAGE = 100;

export interface Author {
  accountId: string;
  firstName: string;
  lastName: string;
}

export interface MyReview {
  /** Le compte peut-il donner (ou modifier) son avis ? */
  canReview: boolean;
  review: Review | null;
}

const notFound = () => new ReviewsError("PRODUIT_INTROUVABLE", "produit introuvable");

/**
 * Avis des clients (S8-T01, ADR-0056, FR-020). Écrire un avis exige un achat livré ; la note moyenne et le nombre
 * d'avis de la fiche sont recalculés dans la MÊME transaction que chaque changement (avis publié, modifié, retiré,
 * refusé), à partir des seuls avis publiés.
 */
@Injectable()
export class ReviewService {
  clock: () => Date = () => new Date();

  constructor(
    @Inject(REVIEW_REPOSITORY) private readonly reviews: ReviewRepository,
    @Inject(REVIEW_LISTINGS) private readonly listings: ReviewListings,
    @Inject(REVIEW_PURCHASES) private readonly purchases: ReviewPurchases,
    @Inject(REVIEWS_TRANSACTION) private readonly tx: ReviewsTransaction,
    @Inject(REVIEWS_RANDOM) private readonly random: ReviewsRandom,
    @Inject(AuditLog) private readonly audit: Pick<AuditLog, "record">,
  ) {}

  /** Avis publiés d'une fiche en ligne, avec la répartition des notes. */
  async page(
    slug: string,
    rawPage: unknown,
  ): Promise<{ summary: ReviewSummary; items: Review[]; page: number; totalPages: number }> {
    const listing = await this.listings.findPublished(slug);
    if (!listing) throw notFound();
    const wanted = typeof rawPage === "string" && /^\d{1,3}$/.test(rawPage) ? Number(rawPage) : 1;
    const summary = await this.reviews.summary(listing.listingId);
    const totalPages = Math.max(1, Math.ceil(summary.count / REVIEWS_PAGE_SIZE));
    const page = Math.min(Math.max(wanted, 1), totalPages, MAX_PAGE);
    const { items } = await this.reviews.published(listing.listingId, page, REVIEWS_PAGE_SIZE);
    return { summary, items, page, totalPages };
  }

  /** L'avis du compte sur cette fiche, et s'il peut en donner un. */
  async mine(slug: string, accountId: string): Promise<MyReview> {
    const listing = await this.listings.findPublished(slug);
    if (!listing) throw notFound();
    const [review, bought] = await Promise.all([
      this.reviews.findMine(listing.listingId, accountId),
      this.purchases.hasDelivered(accountId, listing.offerIds),
    ]);
    return { canReview: bought, review };
  }

  /** Donne ou modifie son avis (achat livré obligatoire). */
  async write(
    slug: string,
    author: Author,
    input: { rating: unknown; comment?: string | null | undefined },
  ): Promise<Review> {
    const listing = await this.listings.findPublished(slug);
    if (!listing) throw notFound();
    if (!(await this.purchases.hasDelivered(author.accountId, listing.offerIds))) {
      throw new ReviewsError(
        "ACHAT_REQUIS",
        "seuls les clients qui ont reçu ce produit peuvent donner leur avis",
      );
    }
    const now = this.clock();
    return this.tx.run(async () => {
      const previous = await this.reviews.findMine(listing.listingId, author.accountId);
      const review = writeReview(
        previous,
        {
          id: this.random.uuid(),
          listingId: listing.listingId,
          accountId: author.accountId,
          rating: input.rating,
          comment: input.comment,
          authorName: authorNameOf(author.firstName, author.lastName),
        },
        now,
      );
      await this.reviews.save(review);
      await this.refreshRating(listing.listingId);
      return review;
    });
  }

  /** Retire son avis. */
  async remove(slug: string, accountId: string): Promise<void> {
    const listing = await this.listings.findPublished(slug);
    if (!listing) throw notFound();
    await this.tx.run(async () => {
      if (!(await this.reviews.delete(listing.listingId, accountId))) {
        throw new ReviewsError("AVIS_INTROUVABLE", "vous n'avez pas d'avis sur ce produit");
      }
      await this.refreshRating(listing.listingId);
    });
  }

  /** File de l'équipe Catalogue, avec le titre et l'adresse de chaque fiche. */
  async queue(query: {
    status: ReviewStatus;
    limit: number;
    after?: ReviewCursor | undefined;
  }): Promise<{
    items: { review: Review; listing: { title: string; slug: string } | null }[];
    next: ReviewCursor | null;
  }> {
    const page = await this.reviews.list(query);
    const listings = await this.listings.describe([...new Set(page.items.map((r) => r.listingId))]);
    return {
      items: page.items.map((review) => ({
        review,
        listing: listings.get(review.listingId) ?? null,
      })),
      next: page.next,
    };
  }

  /** Publier ou refuser un avis en attente (équipe Catalogue), tracé au journal. */
  async decide(
    staffId: string,
    reviewId: string,
    decision: ReviewDecision,
    reason: string | null,
    context: AuditContext,
  ): Promise<Review> {
    const now = this.clock();
    return this.tx.run(async () => {
      const review = await this.reviews.lockById(reviewId);
      if (!review) throw new ReviewsError("AVIS_INTROUVABLE", "avis introuvable");
      const next = moderate(review, decision, { staffId, reason, now });
      await this.reviews.save(next);
      await this.refreshRating(next.listingId);
      await this.audit.record({
        action: decision === "publish" ? "review.published" : "review.rejected",
        actor: { type: "account", id: staffId },
        target: { type: "review", id: review.id },
        details: {
          rating: review.rating,
          ...(next.rejectReason ? { reason: shortReason(next.rejectReason) } : {}),
        },
        context,
      });
      return next;
    });
  }

  /** Note moyenne et nombre d'avis publiés de la fiche, recalculés à partir de la base. */
  private async refreshRating(listingId: string): Promise<void> {
    const { distribution } = await this.reviews.summary(listingId);
    const { count, average } = averageOf(distribution);
    await this.listings.setRating(listingId, average, count);
  }
}

function shortReason(reason: string): string {
  return reason.length <= 100 ? reason : `${reason.slice(0, 99)}…`;
}
