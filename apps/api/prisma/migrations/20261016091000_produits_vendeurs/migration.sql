-- Produits des vendeurs (S6-T02, ADR-0033), étape 2 : modération et boutique suspendue. Migration d'ajout (colonnes
-- vides ou à faux par défaut) : la version précédente de l'API sert le catalogue existant tant qu'aucun produit de vendeur
-- n'est créé. Elle ne connaît ni PENDING / REJECTED ni shop_suspended : arrêter ses instances avant d'ouvrir les routes
-- des vendeurs (relecture de sécurité S6-T02).

-- AlterTable
ALTER TABLE "catalog"."products" ADD COLUMN     "moderation_reason" VARCHAR(300),
ADD COLUMN     "reviewed_at" TIMESTAMPTZ(3),
ADD COLUMN     "reviewed_by" UUID,
ADD COLUMN     "shop_suspended" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "submitted_at" TIMESTAMPTZ(3);

-- CreateIndex
CREATE INDEX "products_status_submitted_at_id_idx" ON "catalog"."products"("status", "submitted_at", "id");

-- ─── Règles que Prisma ne sait pas décrire (ajoutées à la main) ─────────────────────────────

-- Un produit refusé a toujours un motif ; aucun autre n'en a. Un produit en attente a une date de demande.
-- Décision de modération : modérateur et date ensemble. Un produit de la boutique Kemdia ne passe jamais par la
-- modération (ni en attente, ni refusé, ni examiné).
ALTER TABLE "catalog"."products"
    ADD CONSTRAINT "products_moderation_reason_check" CHECK (
        ("status" = 'REJECTED') = ("moderation_reason" IS NOT NULL)
        AND ("moderation_reason" IS NULL OR char_length("moderation_reason") BETWEEN 5 AND 300)
    ),
    ADD CONSTRAINT "products_pending_check" CHECK ("status" <> 'PENDING' OR "submitted_at" IS NOT NULL),
    ADD CONSTRAINT "products_review_check" CHECK (("reviewed_by" IS NULL) = ("reviewed_at" IS NULL)),
    ADD CONSTRAINT "products_kemdia_moderation_check" CHECK (
        "shop_id" <> '6b656d64-6961-4000-8000-000000000001'
        OR ("status" NOT IN ('PENDING', 'REJECTED') AND "reviewed_by" IS NULL AND NOT "shop_suspended")
    );
