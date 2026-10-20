-- Fiche commune et offres des boutiques (S7.5-T02, ADR-0049).
-- Chaque produit existant devient une OFFRE (sa boutique, son prix, son stock) posée sur une FICHE (titre, description,
-- marque, photos, déclinaisons) qui reprend son identifiant et son adresse : les liens du site ne changent pas, les
-- paniers et les commandes (qui désignent des variantes d'offre) non plus. Les doublons sont ensuite fusionnés par
-- l'équipe. Migration en une étape : l'ancienne version de l'API ne lit pas les fiches, arrêter ses instances avant.

-- CreateTable
CREATE TABLE "catalog"."listings" (
    "id" UUID NOT NULL,
    "slug" VARCHAR(120) NOT NULL,
    "title" VARCHAR(120) NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "brand" VARCHAR(60),
    "category_id" UUID NOT NULL,
    "images" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "status" "catalog"."product_status" NOT NULL DEFAULT 'DRAFT',
    "created_by_shop_id" UUID NOT NULL,
    "merged_into_id" UUID,
    "price" INTEGER NOT NULL DEFAULT 0,
    "compare_at_price" INTEGER,
    "offer_count" INTEGER NOT NULL DEFAULT 0,
    "rating" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "review_count" INTEGER NOT NULL DEFAULT 0,
    "is_featured" BOOLEAN NOT NULL DEFAULT false,
    "is_bestseller" BOOLEAN NOT NULL DEFAULT false,
    "is_new" BOOLEAN NOT NULL DEFAULT false,
    "search_text" TEXT NOT NULL DEFAULT '',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "listings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "catalog"."listing_variants" (
    "id" UUID NOT NULL,
    "listing_id" UUID NOT NULL,
    "name" VARCHAR(80) NOT NULL,
    "attributes" JSONB NOT NULL DEFAULT '{}',
    "position" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "listing_variants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "catalog"."sellers" (
    "shop_id" UUID NOT NULL,
    "name" VARCHAR(60) NOT NULL,
    "slug" VARCHAR(80) NOT NULL,
    "city" VARCHAR(60) NOT NULL,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "sellers_pkey" PRIMARY KEY ("shop_id")
);

-- AlterTable
ALTER TABLE "catalog"."products" ADD COLUMN     "listing_id" UUID;

-- AlterTable
ALTER TABLE "catalog"."product_variants" ADD COLUMN     "listing_variant_id" UUID;

-- ─── Reprise des données : une fiche par produit existant, même identifiant, même adresse ────────────────────────

INSERT INTO "catalog"."listings" (
    "id", "slug", "title", "description", "brand", "category_id", "images", "status", "created_by_shop_id",
    "price", "compare_at_price", "offer_count", "rating", "review_count", "is_featured", "is_bestseller", "is_new",
    "search_text", "created_at", "updated_at")
SELECT "id", "slug", "title", "description", "brand", "category_id", COALESCE("images", ARRAY[]::TEXT[]), "status",
    "shop_id", "price", "compare_at_price",
    CASE WHEN "status" = 'PUBLISHED' AND NOT "shop_suspended" THEN 1 ELSE 0 END,
    "rating", "review_count", "is_featured", "is_bestseller", "is_new", "search_text", "created_at", "updated_at"
FROM "catalog"."products";

INSERT INTO "catalog"."listing_variants" ("id", "listing_id", "name", "attributes", "position", "created_at", "updated_at")
SELECT "id", "product_id", "name", "attributes", "position", "created_at", "updated_at"
FROM "catalog"."product_variants";

UPDATE "catalog"."products" SET "listing_id" = "id";
UPDATE "catalog"."product_variants" SET "listing_variant_id" = "id";

-- Boutiques telles que le catalogue les montre (tenues ensuite par le module vendors)
INSERT INTO "catalog"."sellers" ("shop_id", "name", "slug", "city", "updated_at")
SELECT "id", "name", "slug", "city", CURRENT_TIMESTAMP FROM "vendors"."shops";

ALTER TABLE "catalog"."products" ALTER COLUMN "listing_id" SET NOT NULL;
ALTER TABLE "catalog"."product_variants" ALTER COLUMN "listing_variant_id" SET NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "listings_slug_key" ON "catalog"."listings"("slug");

-- CreateIndex
CREATE INDEX "listings_category_id_idx" ON "catalog"."listings"("category_id");

-- CreateIndex
CREATE INDEX "listings_status_offer_count_price_idx" ON "catalog"."listings"("status", "offer_count", "price");

-- CreateIndex
CREATE INDEX "listings_merged_into_id_idx" ON "catalog"."listings"("merged_into_id");

-- CreateIndex
CREATE INDEX "listing_variants_listing_id_idx" ON "catalog"."listing_variants"("listing_id");

-- CreateIndex
CREATE UNIQUE INDEX "products_listing_id_shop_id_key" ON "catalog"."products"("listing_id", "shop_id");

-- CreateIndex
CREATE INDEX "product_variants_listing_variant_id_idx" ON "catalog"."product_variants"("listing_variant_id");

-- CreateIndex
CREATE UNIQUE INDEX "product_variants_product_id_listing_variant_id_key" ON "catalog"."product_variants"("product_id", "listing_variant_id");

-- AddForeignKey
ALTER TABLE "catalog"."listings" ADD CONSTRAINT "listings_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "catalog"."categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "catalog"."listings" ADD CONSTRAINT "listings_merged_into_id_fkey" FOREIGN KEY ("merged_into_id") REFERENCES "catalog"."listings"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "catalog"."listing_variants" ADD CONSTRAINT "listing_variants_listing_id_fkey" FOREIGN KEY ("listing_id") REFERENCES "catalog"."listings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "catalog"."products" ADD CONSTRAINT "products_listing_id_fkey" FOREIGN KEY ("listing_id") REFERENCES "catalog"."listings"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "catalog"."product_variants" ADD CONSTRAINT "product_variants_listing_variant_id_fkey" FOREIGN KEY ("listing_variant_id") REFERENCES "catalog"."listing_variants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ─── Règles que Prisma ne sait pas décrire (ajoutées à la main) ─────────────────────────────

ALTER TABLE "catalog"."listings"
    ADD CONSTRAINT "listings_price_check" CHECK ("price" >= 0),
    ADD CONSTRAINT "listings_compare_at_price_check" CHECK ("compare_at_price" IS NULL OR "compare_at_price" > "price"),
    ADD CONSTRAINT "listings_offer_count_check" CHECK ("offer_count" >= 0),
    ADD CONSTRAINT "listings_rating_check" CHECK ("rating" >= 0 AND "rating" <= 5),
    -- Une fiche fusionnée est archivée et mène à une AUTRE fiche
    ADD CONSTRAINT "listings_merge_check" CHECK (
        "merged_into_id" IS NULL OR ("status" = 'ARCHIVED' AND "merged_into_id" <> "id")
    );

ALTER TABLE "catalog"."sellers"
    ADD CONSTRAINT "sellers_city_check" CHECK (char_length("city") BETWEEN 2 AND 60);

-- 1. Une offre COPIE le contenu de sa fiche (titre, description, marque, catégorie, photos, texte de recherche) : ce
--    que le panier, les commandes et l'espace vendeur lisent sur l'offre est toujours celui de la fiche.
CREATE FUNCTION "catalog"."offer_from_listing"() RETURNS trigger
    LANGUAGE plpgsql AS $$
BEGIN
    SELECT l."title", l."description", l."brand", l."category_id", COALESCE(l."images", ARRAY[]::TEXT[]), l."search_text"
    INTO NEW."title", NEW."description", NEW."brand", NEW."category_id", NEW."images", NEW."search_text"
    FROM "catalog"."listings" AS l
    WHERE l."id" = NEW."listing_id";
    IF NOT FOUND THEN
        RAISE EXCEPTION 'offre sans fiche' USING ERRCODE = '23503';
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER "products_from_listing"
    BEFORE INSERT OR UPDATE OF "listing_id", "title", "description", "brand", "category_id", "images", "search_text"
    ON "catalog"."products"
    FOR EACH ROW EXECUTE FUNCTION "catalog"."offer_from_listing"();

-- 2. Contenu de la fiche modifié : recopié sur toutes ses offres.
CREATE FUNCTION "catalog"."listing_to_offers"() RETURNS trigger
    LANGUAGE plpgsql AS $$
BEGIN
    UPDATE "catalog"."products"
    SET "title" = NEW."title", "description" = NEW."description", "brand" = NEW."brand",
        "category_id" = NEW."category_id", "images" = NEW."images", "search_text" = NEW."search_text"
    WHERE "listing_id" = NEW."id";
    RETURN NULL;
END;
$$;

CREATE TRIGGER "listings_to_offers"
    AFTER UPDATE OF "title", "description", "brand", "category_id", "images", "search_text"
    ON "catalog"."listings"
    FOR EACH ROW EXECUTE FUNCTION "catalog"."listing_to_offers"();

-- 3. Prix « à partir de » et nombre d'offres visibles d'une fiche (offre publiée, boutique non suspendue). Sans offre
--    visible, le prix reste celui de la dernière offre connue (la fiche est alors cachée).
CREATE FUNCTION "catalog"."refresh_listing"(listing UUID) RETURNS void
    LANGUAGE plpgsql AS $$
DECLARE
    n INTEGER;
    best_price INTEGER;
    best_compare INTEGER;
BEGIN
    SELECT count(*)::int INTO n FROM "catalog"."products"
    WHERE "listing_id" = listing AND "status" = 'PUBLISHED' AND NOT "shop_suspended";
    SELECT "price", "compare_at_price" INTO best_price, best_compare FROM "catalog"."products"
    WHERE "listing_id" = listing AND "status" = 'PUBLISHED' AND NOT "shop_suspended"
    ORDER BY "price", "id" LIMIT 1;
    IF NOT FOUND THEN
        SELECT "price", "compare_at_price" INTO best_price, best_compare FROM "catalog"."products"
        WHERE "listing_id" = listing ORDER BY "price", "id" LIMIT 1;
    END IF;
    UPDATE "catalog"."listings" AS l
    SET "offer_count" = n,
        "price" = COALESCE(best_price, l."price"),
        "compare_at_price" = CASE WHEN best_price IS NULL THEN l."compare_at_price" ELSE best_compare END,
        "updated_at" = CURRENT_TIMESTAMP
    WHERE l."id" = listing
      AND (l."offer_count", l."price", l."compare_at_price") IS DISTINCT FROM
          (n, COALESCE(best_price, l."price"),
           CASE WHEN best_price IS NULL THEN l."compare_at_price" ELSE best_compare END);
END;
$$;

-- 4. Offre créée, modifiée (statut, suspension, prix, fiche) ou effacée : agrégats de la fiche recalculés. Tant que la
--    fiche n'est pas publiée, elle suit le statut de l'offre de la boutique qui l'a créée (modération, archivage) ;
--    une fois publiée, seule l'équipe change son statut.
CREATE FUNCTION "catalog"."offer_changed"() RETURNS trigger
    LANGUAGE plpgsql AS $$
BEGIN
    IF TG_OP <> 'DELETE' THEN
        UPDATE "catalog"."listings" AS l
        SET "status" = NEW."status", "updated_at" = CURRENT_TIMESTAMP
        WHERE l."id" = NEW."listing_id" AND l."created_by_shop_id" = NEW."shop_id"
          AND l."status" <> 'PUBLISHED' AND l."merged_into_id" IS NULL AND l."status" <> NEW."status";
        PERFORM "catalog"."refresh_listing"(NEW."listing_id");
    END IF;
    IF TG_OP = 'DELETE' OR (TG_OP = 'UPDATE' AND OLD."listing_id" <> NEW."listing_id") THEN
        PERFORM "catalog"."refresh_listing"(OLD."listing_id");
    END IF;
    RETURN NULL;
END;
$$;

CREATE TRIGGER "products_offer_changed"
    AFTER INSERT OR DELETE OR UPDATE OF "status", "shop_suspended", "price", "compare_at_price", "listing_id", "shop_id"
    ON "catalog"."products"
    FOR EACH ROW EXECUTE FUNCTION "catalog"."offer_changed"();

-- 5. Une variante d'offre copie le nom et les caractéristiques de sa déclinaison, qui doit appartenir à la fiche de
--    l'offre.
CREATE FUNCTION "catalog"."offer_variant_from_listing"() RETURNS trigger
    LANGUAGE plpgsql AS $$
DECLARE
    variant_listing UUID;
    offer_listing UUID;
BEGIN
    SELECT lv."name", lv."attributes", lv."listing_id" INTO NEW."name", NEW."attributes", variant_listing
    FROM "catalog"."listing_variants" AS lv WHERE lv."id" = NEW."listing_variant_id";
    SELECT p."listing_id" INTO offer_listing FROM "catalog"."products" AS p WHERE p."id" = NEW."product_id";
    IF variant_listing IS NULL OR variant_listing IS DISTINCT FROM offer_listing THEN
        RAISE EXCEPTION 'déclinaison d''une autre fiche' USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER "product_variants_from_listing"
    BEFORE INSERT OR UPDATE OF "listing_variant_id", "product_id", "name", "attributes"
    ON "catalog"."product_variants"
    FOR EACH ROW EXECUTE FUNCTION "catalog"."offer_variant_from_listing"();

-- 6. Déclinaison renommée : recopiée sur les variantes des offres.
CREATE FUNCTION "catalog"."listing_variant_to_offers"() RETURNS trigger
    LANGUAGE plpgsql AS $$
BEGIN
    UPDATE "catalog"."product_variants"
    SET "name" = NEW."name", "attributes" = NEW."attributes"
    WHERE "listing_variant_id" = NEW."id";
    RETURN NULL;
END;
$$;

CREATE TRIGGER "listing_variants_to_offers"
    AFTER UPDATE OF "name", "attributes"
    ON "catalog"."listing_variants"
    FOR EACH ROW EXECUTE FUNCTION "catalog"."listing_variant_to_offers"();
