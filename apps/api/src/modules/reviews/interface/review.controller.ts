import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Put,
  Query,
  Req,
  UseGuards,
} from "@nestjs/common";
import type { Request } from "express";
import {
  ReviewIdParamsSchema,
  ReviewListParamsSchema,
  ReviewPublishRequestSchema,
  ReviewRejectRequestSchema,
  ReviewRequestSchema,
  type AdminReview,
  type AdminReviewPage,
  type MyReview,
  type ReviewListParams,
  type ReviewPage,
  type ReviewPublishRequest,
  type ReviewRejectRequest,
  type ReviewRequest,
} from "@kemdia/contracts";
import { auditContextOf } from "../../audit/index.js";
import {
  AccountRateLimit,
  Authorize,
  CurrentSession,
  SessionGuard,
  type AuthenticatedSession,
} from "../../identity/index.js";
import { ReviewService } from "../application/review.service.js";
import {
  decodeReviewCursor,
  encodeReviewCursor,
  presentAdminReview,
  presentOwnReview,
  presentPublicReview,
} from "./review.presenter.js";
import { withReviewsErrors } from "./reviews-http-errors.js";

/** Le catalogue change rarement : 60 s de cache public, comme les fiches. */
const CACHE_PUBLIC = "public, max-age=60";

/** Avis publiés d'une fiche (public) et l'avis du compte connecté (`/api/v1/products/{slug}/reviews`, S8-T01). */
@Controller("products/:slug/reviews")
export class ReviewController {
  constructor(private readonly reviews: ReviewService) {}

  @Get()
  @Header("Cache-Control", CACHE_PUBLIC)
  async page(@Param("slug") slug: string, @Query("page") page?: unknown): Promise<ReviewPage> {
    const result = await withReviewsErrors(() =>
      this.reviews.page(slug, Array.isArray(page) ? page[0] : page),
    );
    return {
      summary: result.summary,
      items: result.items.map(presentPublicReview),
      page: result.page,
      totalPages: result.totalPages,
    };
  }

  @Get("mine")
  @Header("Cache-Control", "no-store")
  @UseGuards(SessionGuard)
  async mine(
    @Param("slug") slug: string,
    @CurrentSession() session: AuthenticatedSession,
  ): Promise<MyReview> {
    const mine = await withReviewsErrors(() => this.reviews.mine(slug, session.account.id));
    return {
      canReview: mine.canReview,
      review: mine.review ? presentOwnReview(mine.review) : null,
    };
  }

  /** Donner ou modifier son avis : achat livré obligatoire ; 10 par minute et par compte. */
  @Put("mine")
  @Header("Cache-Control", "no-store")
  @UseGuards(SessionGuard)
  @AccountRateLimit(10)
  async write(
    @Param("slug") slug: string,
    @CurrentSession() session: AuthenticatedSession,
    @Body({ schema: ReviewRequestSchema }) body: ReviewRequest,
  ) {
    const { id, firstName, lastName } = session.account;
    const review = await withReviewsErrors(() =>
      this.reviews.write(slug, { accountId: id, firstName, lastName }, body),
    );
    return presentOwnReview(review);
  }

  @Delete("mine")
  @HttpCode(HttpStatus.NO_CONTENT)
  @Header("Cache-Control", "no-store")
  @UseGuards(SessionGuard)
  @AccountRateLimit(10)
  async remove(
    @Param("slug") slug: string,
    @CurrentSession() session: AuthenticatedSession,
  ): Promise<void> {
    await withReviewsErrors(() => this.reviews.remove(slug, session.account.id));
  }
}

/** File de modération des avis (`/api/v1/admin/reviews`), équipe Catalogue avec la double authentification. */
@Controller("admin/reviews")
@Authorize("catalog", { secondFactor: true })
export class AdminReviewController {
  constructor(private readonly reviews: ReviewService) {}

  @Get()
  @Header("Cache-Control", "no-store")
  async list(
    @Query({ schema: ReviewListParamsSchema }) query: ReviewListParams,
  ): Promise<AdminReviewPage> {
    const page = await this.reviews.queue({
      status: query.status,
      limit: query.limit,
      after: query.after ? decodeReviewCursor(query.after) : undefined,
    });
    return {
      items: page.items.map(({ review, listing }) => presentAdminReview(review, listing)),
      nextCursor: page.next ? encodeReviewCursor(page.next) : null,
    };
  }

  @Post(":reviewId/publish")
  @HttpCode(HttpStatus.OK)
  @Header("Cache-Control", "no-store")
  async publish(
    @CurrentSession() session: AuthenticatedSession,
    @Param({ schema: ReviewIdParamsSchema }) params: { reviewId: string },
    @Body({ schema: ReviewPublishRequestSchema }) body: ReviewPublishRequest,
    @Req() req: Request,
  ): Promise<AdminReview> {
    const review = await withReviewsErrors(() =>
      this.reviews.decide(
        session.account.id,
        params.reviewId,
        "publish",
        null,
        body.version,
        auditContextOf(req),
      ),
    );
    return presentAdminReview(review, null);
  }

  @Post(":reviewId/reject")
  @HttpCode(HttpStatus.OK)
  @Header("Cache-Control", "no-store")
  async reject(
    @CurrentSession() session: AuthenticatedSession,
    @Param({ schema: ReviewIdParamsSchema }) params: { reviewId: string },
    @Body({ schema: ReviewRejectRequestSchema }) body: ReviewRejectRequest,
    @Req() req: Request,
  ): Promise<AdminReview> {
    const review = await withReviewsErrors(() =>
      this.reviews.decide(
        session.account.id,
        params.reviewId,
        "reject",
        body.reason,
        body.version,
        auditContextOf(req),
      ),
    );
    return presentAdminReview(review, null);
  }
}
