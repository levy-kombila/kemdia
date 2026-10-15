-- Boutiques des vendeurs (S6-T01, ADR-0032). Migration d'ajout : la version précédente de l'API continue de fonctionner
-- (nouveau schéma "vendors" ; nouvelle colonne "shop_id" des produits, remplie avec la boutique Kemdia par défaut).

-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "vendors";

-- CreateEnum
CREATE TYPE "vendors"."shop_status" AS ENUM ('PENDING', 'ACTIVE', 'REJECTED', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "vendors"."shop_kind" AS ENUM ('KEMDIA', 'PARTNER');

-- AlterTable
ALTER TABLE "catalog"."products" ADD COLUMN     "shop_id" UUID NOT NULL DEFAULT '6b656d64-6961-4000-8000-000000000001';

-- CreateTable
CREATE TABLE "vendors"."shops" (
    "id" UUID NOT NULL,
    "kind" "vendors"."shop_kind" NOT NULL DEFAULT 'PARTNER',
    "owner_account_id" UUID,
    "name" VARCHAR(60) NOT NULL,
    "name_key" VARCHAR(60),
    "slug" VARCHAR(80) NOT NULL,
    "city" VARCHAR(60) NOT NULL,
    "contact_phone" VARCHAR(16),
    "description" VARCHAR(500) NOT NULL DEFAULT '',
    "status" "vendors"."shop_status" NOT NULL DEFAULT 'PENDING',
    "status_reason" VARCHAR(300),
    "reviewed_by" UUID,
    "reviewed_at" TIMESTAMPTZ(3),
    "submitted_at" TIMESTAMPTZ(3) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "shops_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "products_shop_id_idx" ON "catalog"."products"("shop_id");

-- CreateIndex
CREATE UNIQUE INDEX "shops_owner_account_id_key" ON "vendors"."shops"("owner_account_id");

-- CreateIndex
CREATE UNIQUE INDEX "shops_name_key_key" ON "vendors"."shops"("name_key");

-- CreateIndex
CREATE UNIQUE INDEX "shops_slug_key" ON "vendors"."shops"("slug");

-- CreateIndex
CREATE INDEX "shops_status_submitted_at_id_idx" ON "vendors"."shops"("status", "submitted_at", "id");

-- ─── Règles que Prisma ne sait pas décrire (ajoutées à la main) ─────────────────────────────

-- Une seule boutique Kemdia : son identifiant est imposé (clé primaire, donc unique), sans propriétaire, toujours active,
-- jamais « examinée ». (Contrainte CHECK plutôt qu'un index partiel : Prisma ne les décrit pas et `db:check` le signalerait.)
-- Clé du nom vide ⇔ boutique refusée : le nom refusé est libéré pour un autre demandeur.
-- Une boutique de vendeur : un propriétaire et un mobile gabonais (06… Moov, 07… Airtel), jamais validée par lui-même.
-- Longueurs : mêmes valeurs que SHOP_LIMITS (@kemdia/contracts), comptées après nettoyage des espaces par l'API.
-- Un refus ou une suspension a toujours un motif ; une boutique en attente ou active n'en a pas.
ALTER TABLE "vendors"."shops"
    ADD CONSTRAINT "shops_kind_check" CHECK (
        ("kind" = 'KEMDIA' AND "owner_account_id" IS NULL AND "contact_phone" IS NULL AND "status" = 'ACTIVE'
            AND "reviewed_by" IS NULL)
        OR ("kind" = 'PARTNER' AND "owner_account_id" IS NOT NULL AND "contact_phone" IS NOT NULL)
    ),
    ADD CONSTRAINT "shops_contact_phone_check" CHECK ("contact_phone" IS NULL OR "contact_phone" ~ '^\+2410[67][0-9]{7}$'),
    ADD CONSTRAINT "shops_name_check" CHECK (char_length("name") BETWEEN 3 AND 60 AND "name" = btrim("name")),
    ADD CONSTRAINT "shops_name_key_check" CHECK (
        ("status" = 'REJECTED') = ("name_key" IS NULL)
        AND ("name_key" IS NULL OR "name_key" ~ '^[a-z0-9]+( [a-z0-9]+)*$')
    ),
    ADD CONSTRAINT "shops_kemdia_id_check" CHECK (
        "kind" <> 'KEMDIA' OR "id" = '6b656d64-6961-4000-8000-000000000001'
    ),
    ADD CONSTRAINT "shops_slug_check" CHECK ("slug" ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
    ADD CONSTRAINT "shops_city_check" CHECK (char_length("city") BETWEEN 2 AND 60 AND "city" = btrim("city")),
    ADD CONSTRAINT "shops_description_check" CHECK (
        "kind" = 'KEMDIA' OR char_length("description") BETWEEN 20 AND 500
    ),
    ADD CONSTRAINT "shops_status_reason_check" CHECK (
        ("status" IN ('REJECTED', 'SUSPENDED')) = ("status_reason" IS NOT NULL)
        AND ("status_reason" IS NULL OR char_length("status_reason") BETWEEN 5 AND 300)
    ),
    ADD CONSTRAINT "shops_review_check" CHECK (
        ("reviewed_by" IS NULL) = ("reviewed_at" IS NULL)
        AND ("reviewed_by" IS NULL OR "owner_account_id" IS NULL OR "reviewed_by" <> "owner_account_id")
    );

-- La boutique Kemdia : propriétaire des produits existants (colonne "shop_id" ci-dessus, valeur par défaut).
INSERT INTO "vendors"."shops"
    ("id", "kind", "name", "name_key", "slug", "city", "description", "status", "submitted_at", "updated_at")
VALUES
    ('6b656d64-6961-4000-8000-000000000001', 'KEMDIA', 'Kemdia', 'kemdia', 'kemdia', 'Libreville',
     'Produits vendus et expédiés par Kemdia', 'ACTIVE', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);
