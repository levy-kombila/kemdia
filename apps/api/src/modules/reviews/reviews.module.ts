import { Module } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { AuditModule } from "../audit/index.js";
import { CatalogModule, ListingRatings } from "../catalog/index.js";
import { IdentityModule } from "../identity/index.js";
import { OrdersModule, OrdersPurchases } from "../orders/index.js";
import {
  REVIEWS_RANDOM,
  REVIEWS_TRANSACTION,
  REVIEW_LISTINGS,
  REVIEW_PURCHASES,
  REVIEW_REPOSITORY,
} from "./application/ports.js";
import { ReviewService } from "./application/review.service.js";
import { PrismaReviewRepository } from "./infrastructure/prisma-review.repository.js";
import { ReviewsPersonalData } from "./infrastructure/reviews-personal-data.js";
import { ReviewsTransactionRunner } from "./infrastructure/reviews-transaction.js";
import { AdminReviewController, ReviewController } from "./interface/review.controller.js";

/**
 * Avis des clients (S8-T01, ADR-0056, FR-020) : donner son avis après une livraison, modération des commentaires par
 * l'équipe Catalogue, note moyenne des fiches. Fiches et achats sont lus par les ports publics de catalog et orders.
 */
@Module({
  imports: [IdentityModule, AuditModule, CatalogModule, OrdersModule],
  controllers: [ReviewController, AdminReviewController],
  providers: [
    ReviewService,
    ReviewsPersonalData,
    { provide: REVIEW_REPOSITORY, useClass: PrismaReviewRepository },
    { provide: REVIEW_LISTINGS, useExisting: ListingRatings },
    { provide: REVIEW_PURCHASES, useExisting: OrdersPurchases },
    { provide: REVIEWS_TRANSACTION, useClass: ReviewsTransactionRunner },
    { provide: REVIEWS_RANDOM, useValue: { uuid: () => randomUUID() } },
  ],
  exports: [ReviewsPersonalData],
})
export class ReviewsModule {}
