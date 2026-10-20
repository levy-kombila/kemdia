-- Propositions de correction des fiches en ligne (S7.5-T03, ADR-0050) : une boutique qui vend sur une fiche propose
-- une correction (message libre), l'équipe corrige la fiche puis clôt la proposition. Migration d'ajout.

-- CreateTable
CREATE TABLE "catalog"."listing_corrections" (
    "id" UUID NOT NULL,
    "listing_id" UUID NOT NULL,
    "shop_id" UUID NOT NULL,
    "message" VARCHAR(500) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closed_by" UUID,
    "closed_at" TIMESTAMPTZ(3),
    "note" VARCHAR(300),

    CONSTRAINT "listing_corrections_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "listing_corrections_closed_at_created_at_id_idx" ON "catalog"."listing_corrections"("closed_at", "created_at", "id");

-- CreateIndex
CREATE INDEX "listing_corrections_listing_id_idx" ON "catalog"."listing_corrections"("listing_id");

-- CreateIndex
CREATE INDEX "listing_corrections_shop_id_idx" ON "catalog"."listing_corrections"("shop_id");

-- AddForeignKey
ALTER TABLE "catalog"."listing_corrections" ADD CONSTRAINT "listing_corrections_listing_id_fkey" FOREIGN KEY ("listing_id") REFERENCES "catalog"."listings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ─── Règles que Prisma ne sait pas décrire (ajoutées à la main) ─────────────────────────────

-- Message de 10 à 500 caractères ; clôture complète (qui ET quand) ; une réponse seulement à la clôture
ALTER TABLE "catalog"."listing_corrections"
    ADD CONSTRAINT "listing_corrections_message_check" CHECK (char_length("message") BETWEEN 10 AND 500),
    ADD CONSTRAINT "listing_corrections_closed_check" CHECK (("closed_by" IS NULL) = ("closed_at" IS NULL)),
    ADD CONSTRAINT "listing_corrections_note_check" CHECK (
        "note" IS NULL OR ("closed_at" IS NOT NULL AND char_length("note") BETWEEN 1 AND 300)
    );
