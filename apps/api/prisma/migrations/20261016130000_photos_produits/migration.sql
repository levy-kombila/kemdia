-- Photos des produits des vendeurs (S6-T04, ADR-0035). Migration d'ajout : la version précédente de l'API ignore la
-- nouvelle table (elle ne lit que `products.images`, dont le format ne change pas).

-- CreateTable
CREATE TABLE "catalog"."product_images" (
    "id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "large" BYTEA NOT NULL,
    "small" BYTEA NOT NULL,
    "width" INTEGER NOT NULL,
    "height" INTEGER NOT NULL,
    "sha256" CHAR(64) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "product_images_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "product_images_product_id_idx" ON "catalog"."product_images"("product_id");

-- AddForeignKey
ALTER TABLE "catalog"."product_images" ADD CONSTRAINT "product_images_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "catalog"."products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ─── Règles que Prisma ne sait pas décrire (ajoutées à la main) ─────────────────────────────

-- Mêmes valeurs que PRODUCT_IMAGE_LIMITS (@kemdia/contracts) : 2 Mo au plus par image gardée ; grande image de 1 600 px
-- au plus ; les deux commencent par l'en-tête WebP (« RIFF » … « WEBP ») : rien d'autre n'est jamais servi.
ALTER TABLE "catalog"."product_images"
    ADD CONSTRAINT "product_images_size_check" CHECK (
        octet_length("large") BETWEEN 16 AND 2097152 AND octet_length("small") BETWEEN 16 AND 2097152
    ),
    ADD CONSTRAINT "product_images_webp_check" CHECK (
        substring("large" from 1 for 4) = '\x52494646'::bytea AND substring("large" from 9 for 4) = '\x57454250'::bytea
        AND substring("small" from 1 for 4) = '\x52494646'::bytea AND substring("small" from 9 for 4) = '\x57454250'::bytea
    ),
    ADD CONSTRAINT "product_images_dimensions_check" CHECK ("width" BETWEEN 1 AND 1600 AND "height" BETWEEN 1 AND 1600),
    ADD CONSTRAINT "product_images_sha256_check" CHECK ("sha256" ~ '^[0-9a-f]{64}$');

-- Une photo appartient toujours au même produit, et son contenu ne change jamais (on en ajoute une autre)
CREATE FUNCTION "catalog"."product_images_frozen"() RETURNS trigger
    LANGUAGE plpgsql AS $$
BEGIN
    RAISE EXCEPTION 'une photo de produit ne se modifie pas (S6-T04)' USING ERRCODE = 'check_violation';
END;
$$;

CREATE TRIGGER "product_images_frozen"
    BEFORE UPDATE ON "catalog"."product_images"
    FOR EACH ROW EXECUTE FUNCTION "catalog"."product_images_frozen"();
