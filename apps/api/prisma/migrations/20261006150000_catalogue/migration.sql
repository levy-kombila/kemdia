-- CreateEnum
CREATE TYPE "catalog"."product_status" AS ENUM ('DRAFT', 'PUBLISHED', 'ARCHIVED');

-- CreateTable
CREATE TABLE "catalog"."categories" (
    "id" UUID NOT NULL,
    "slug" VARCHAR(120) NOT NULL,
    "name" VARCHAR(80) NOT NULL,
    "parent_id" UUID,
    "icon" VARCHAR(40) NOT NULL,
    "image" VARCHAR(200),
    "position" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "catalog"."products" (
    "id" UUID NOT NULL,
    "slug" VARCHAR(120) NOT NULL,
    "title" VARCHAR(120) NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "brand" VARCHAR(60),
    "category_id" UUID NOT NULL,
    "images" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "status" "catalog"."product_status" NOT NULL DEFAULT 'DRAFT',
    "price" INTEGER NOT NULL,
    "compare_at_price" INTEGER,
    "rating" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "review_count" INTEGER NOT NULL DEFAULT 0,
    "is_featured" BOOLEAN NOT NULL DEFAULT false,
    "is_bestseller" BOOLEAN NOT NULL DEFAULT false,
    "is_new" BOOLEAN NOT NULL DEFAULT false,
    "search_text" TEXT NOT NULL DEFAULT '',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "products_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "catalog"."product_variants" (
    "id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "sku" VARCHAR(40) NOT NULL,
    "name" VARCHAR(80) NOT NULL,
    "attributes" JSONB NOT NULL DEFAULT '{}',
    "price" INTEGER NOT NULL,
    "compare_at_price" INTEGER,
    "stock" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "position" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "product_variants_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "categories_slug_key" ON "catalog"."categories"("slug");

-- CreateIndex
CREATE INDEX "categories_parent_id_idx" ON "catalog"."categories"("parent_id");

-- CreateIndex
CREATE UNIQUE INDEX "products_slug_key" ON "catalog"."products"("slug");

-- CreateIndex
CREATE INDEX "products_category_id_idx" ON "catalog"."products"("category_id");

-- CreateIndex
CREATE INDEX "products_status_price_idx" ON "catalog"."products"("status", "price");

-- CreateIndex
CREATE UNIQUE INDEX "product_variants_sku_key" ON "catalog"."product_variants"("sku");

-- CreateIndex
CREATE INDEX "product_variants_product_id_idx" ON "catalog"."product_variants"("product_id");

-- AddForeignKey
ALTER TABLE "catalog"."categories" ADD CONSTRAINT "categories_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "catalog"."categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "catalog"."products" ADD CONSTRAINT "products_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "catalog"."categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "catalog"."product_variants" ADD CONSTRAINT "product_variants_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "catalog"."products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Règles métier garanties par la base elle-même (ajoutées à la main : Prisma ne sait pas les décrire).
-- Même si un bug laissait passer une valeur invalide, PostgreSQL la refuserait.

-- BR-004 : prix en FCFA entiers, strictement positifs ; prix barré supérieur au prix
ALTER TABLE "catalog"."products"
    ADD CONSTRAINT "products_price_check" CHECK ("price" > 0),
    ADD CONSTRAINT "products_compare_at_price_check" CHECK ("compare_at_price" IS NULL OR "compare_at_price" > "price"),
    ADD CONSTRAINT "products_rating_check" CHECK ("rating" >= 0 AND "rating" <= 5),
    ADD CONSTRAINT "products_review_count_check" CHECK ("review_count" >= 0);

-- Stock jamais négatif (aucune survente possible, préparation de BR-012)
ALTER TABLE "catalog"."product_variants"
    ADD CONSTRAINT "product_variants_price_check" CHECK ("price" > 0),
    ADD CONSTRAINT "product_variants_compare_at_price_check" CHECK ("compare_at_price" IS NULL OR "compare_at_price" > "price"),
    ADD CONSTRAINT "product_variants_stock_check" CHECK ("stock" >= 0);

-- Une catégorie ne peut pas être sa propre parente
ALTER TABLE "catalog"."categories"
    ADD CONSTRAINT "categories_parent_check" CHECK ("parent_id" IS NULL OR "parent_id" <> "id");

-- BR-005 : 3 niveaux de catégories au plus, et aucune boucle (catégorie placée sous sa propre descendante).
-- Une contrainte CHECK ne voit qu'une ligne : un déclencheur parcourt les parents et les sous-catégories.
CREATE FUNCTION "catalog"."check_category_depth"() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
    max_depth CONSTANT integer := 3;
    ancestors integer := 0;
    ancestor uuid := NEW."parent_id";
    height integer;
BEGIN
    -- Un seul changement d'arborescence à la fois : deux déplacements simultanés ne peuvent pas contourner la règle
    PERFORM pg_advisory_xact_lock(hashtext('catalog.categories'));

    -- Niveau du nouvel emplacement : on remonte les parents
    WHILE ancestor IS NOT NULL LOOP
        IF ancestor = NEW."id" THEN
            RAISE EXCEPTION 'catégorie « % » : elle ne peut pas être placée sous sa propre sous-catégorie', NEW."slug"
                USING ERRCODE = 'check_violation', CONSTRAINT = 'categories_depth_check';
        END IF;
        ancestors := ancestors + 1;
        EXIT WHEN ancestors > max_depth;
        SELECT "parent_id" INTO ancestor FROM "catalog"."categories" WHERE "id" = ancestor;
    END LOOP;

    -- Hauteur des sous-catégories qui suivent la catégorie (cas d'un déplacement)
    WITH RECURSIVE "descendants" AS (
        SELECT "id", 1 AS "level" FROM "catalog"."categories" WHERE "parent_id" = NEW."id"
        UNION ALL
        SELECT c."id", d."level" + 1
        FROM "catalog"."categories" c JOIN "descendants" d ON c."parent_id" = d."id"
        WHERE d."level" < max_depth
    )
    SELECT COALESCE(MAX("level"), 0) INTO height FROM "descendants";

    IF ancestors + 1 + height > max_depth THEN
        RAISE EXCEPTION 'catégorie « % » : % niveaux au plus (BR-005)', NEW."slug", max_depth
            USING ERRCODE = 'check_violation', CONSTRAINT = 'categories_depth_check';
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER "categories_depth_check"
    BEFORE INSERT OR UPDATE OF "parent_id" ON "catalog"."categories"
    FOR EACH ROW EXECUTE FUNCTION "catalog"."check_category_depth"();
