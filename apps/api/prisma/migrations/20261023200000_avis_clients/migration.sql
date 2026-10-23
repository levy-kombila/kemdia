-- S8-T01 (ADR-0056) : avis des clients sur les fiches produits (FR-020).
CREATE SCHEMA IF NOT EXISTS "reviews";

CREATE TYPE "reviews"."review_status" AS ENUM ('PENDING', 'PUBLISHED', 'REJECTED');

CREATE TABLE "reviews"."reviews" (
    "id" UUID NOT NULL,
    "listing_id" UUID NOT NULL,
    "account_id" UUID NOT NULL,
    "rating" SMALLINT NOT NULL,
    "comment" VARCHAR(1000),
    "author_name" VARCHAR(80) NOT NULL,
    "status" "reviews"."review_status" NOT NULL,
    "reject_reason" VARCHAR(300),
    "reviewed_by" UUID,
    "reviewed_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "reviews_pkey" PRIMARY KEY ("id"),
    -- La base double les règles du domaine
    CONSTRAINT "reviews_rating_check" CHECK ("rating" BETWEEN 1 AND 5),
    CONSTRAINT "reviews_comment_check" CHECK (
        "comment" IS NULL OR (char_length("comment") BETWEEN 10 AND 1000 AND "comment" = btrim("comment"))
    ),
    CONSTRAINT "reviews_author_name_check" CHECK (char_length("author_name") BETWEEN 1 AND 80),
    -- Une note seule n'attend jamais l'équipe ; un refus a toujours un motif
    CONSTRAINT "reviews_status_check" CHECK (
        ("status" <> 'PENDING' OR "comment" IS NOT NULL)
        AND (("status" = 'REJECTED') = ("reject_reason" IS NOT NULL))
        AND ("reject_reason" IS NULL OR char_length("reject_reason") BETWEEN 5 AND 300)
    )
);

CREATE UNIQUE INDEX "reviews_listing_id_account_id_key" ON "reviews"."reviews" ("listing_id", "account_id");
CREATE INDEX "reviews_listing_id_status_updated_at_id_idx"
    ON "reviews"."reviews" ("listing_id", "status", "updated_at" DESC, "id" DESC);
CREATE INDEX "reviews_status_updated_at_id_idx" ON "reviews"."reviews" ("status", "updated_at", "id");
CREATE INDEX "reviews_account_id_idx" ON "reviews"."reviews" ("account_id");
