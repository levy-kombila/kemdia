-- Panier serveur (S5-T01, ADR-0023) : nouveau schéma "orders".
-- Migration d'ajout seulement : la version précédente de l'API ne voit pas ces tables et continue de fonctionner.

-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "orders";

-- CreateTable
CREATE TABLE "orders"."carts" (
    "id" UUID NOT NULL,
    "account_id" UUID NOT NULL,
    "last_merge_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "carts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "orders"."cart_items" (
    "cart_id" UUID NOT NULL,
    "variant_id" UUID NOT NULL,
    "quantity" INTEGER NOT NULL,
    "added_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cart_items_pkey" PRIMARY KEY ("cart_id","variant_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "carts_account_id_key" ON "orders"."carts"("account_id");

-- CreateIndex
CREATE INDEX "carts_updated_at_idx" ON "orders"."carts"("updated_at");

-- AddForeignKey
ALTER TABLE "orders"."cart_items" ADD CONSTRAINT "cart_items_cart_id_fkey" FOREIGN KEY ("cart_id") REFERENCES "orders"."carts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Règles que Prisma ne sait pas décrire (ajoutées à la main)

-- Quantité d'une ligne : de 1 à 20 (CART_MAX_QUANTITY du contrat).
ALTER TABLE "orders"."cart_items"
    ADD CONSTRAINT "cart_items_quantity_check" CHECK ("quantity" BETWEEN 1 AND 20);

-- 50 lignes au plus par panier (CART_MAX_LINES du contrat), même si le code de l'API se trompait.
-- L'API verrouille la ligne du panier (carts) avant d'écrire : deux ajouts simultanés ne peuvent pas dépasser la limite.
CREATE FUNCTION "orders"."cart_items_max_lines"() RETURNS trigger
    LANGUAGE plpgsql AS $$
BEGIN
    IF (SELECT count(*) FROM "orders"."cart_items" WHERE "cart_id" = NEW."cart_id") > 50 THEN
        RAISE EXCEPTION 'panier plein : 50 lignes au plus' USING ERRCODE = 'check_violation';
    END IF;
    RETURN NULL;
END;
$$;

CREATE TRIGGER "cart_items_max_lines"
    AFTER INSERT ON "orders"."cart_items"
    FOR EACH ROW EXECUTE FUNCTION "orders"."cart_items_max_lines"();
