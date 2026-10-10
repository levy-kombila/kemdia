-- Coupons (S5-T03, ADR-0025). Migration d'ajout : la version précédente de l'API (sans coupons) continue de fonctionner
-- (nouvelle colonne "discount" à 0 par défaut, "coupon_code" vide).

-- CreateEnum
CREATE TYPE "orders"."coupon_kind" AS ENUM ('PERCENT', 'FIXED');

-- AlterTable
ALTER TABLE "orders"."orders" ADD COLUMN     "coupon_code" VARCHAR(20),
ADD COLUMN     "discount" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "orders"."coupons" (
    "id" UUID NOT NULL,
    "code" VARCHAR(20) NOT NULL,
    "kind" "orders"."coupon_kind" NOT NULL,
    "value" INTEGER NOT NULL,
    "max_discount" INTEGER,
    "min_subtotal" INTEGER,
    "starts_at" TIMESTAMPTZ(3) NOT NULL,
    "ends_at" TIMESTAMPTZ(3),
    "usage_limit" INTEGER,
    "used_count" INTEGER NOT NULL DEFAULT 0,
    "per_account_limit" INTEGER,
    "stackable_with_sales" BOOLEAN NOT NULL DEFAULT false,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "coupons_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "orders"."coupon_redemptions" (
    "id" UUID NOT NULL,
    "coupon_id" UUID NOT NULL,
    "order_id" UUID NOT NULL,
    "account_id" UUID NOT NULL,
    "amount" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "released_at" TIMESTAMPTZ(3),

    CONSTRAINT "coupon_redemptions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "coupons_code_key" ON "orders"."coupons"("code");

-- CreateIndex
CREATE INDEX "coupons_created_at_idx" ON "orders"."coupons"("created_at");

-- CreateIndex
CREATE UNIQUE INDEX "coupon_redemptions_order_id_key" ON "orders"."coupon_redemptions"("order_id");

-- CreateIndex
CREATE INDEX "coupon_redemptions_coupon_id_account_id_idx" ON "orders"."coupon_redemptions"("coupon_id", "account_id");

-- AddForeignKey
ALTER TABLE "orders"."coupon_redemptions" ADD CONSTRAINT "coupon_redemptions_coupon_id_fkey" FOREIGN KEY ("coupon_id") REFERENCES "orders"."coupons"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders"."coupon_redemptions" ADD CONSTRAINT "coupon_redemptions_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"."orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ─── Règles que Prisma ne sait pas décrire (ajoutées à la main) ─────────────────────────────

-- Montants de la commande avec la réduction : total = articles − réduction + livraison ; la réduction ne couvre jamais
-- tous les articles (commande à 0 FCFA impossible à payer) ; réduction ⇔ code coupon.
-- La nouvelle règle est posée AVANT de retirer l'ancienne : à aucun moment la table n'est sans contrôle des montants.
ALTER TABLE "orders"."orders"
    ADD CONSTRAINT "orders_amounts_coupon_check" CHECK (
        "subtotal" > 0 AND "delivery_fee" >= 0 AND "discount" >= 0 AND "discount" < "subtotal"
        AND "total" = "subtotal" - "discount" + "delivery_fee" AND "total" > 0
    ),
    ADD CONSTRAINT "orders_coupon_check" CHECK (("discount" > 0) = ("coupon_code" IS NOT NULL));
ALTER TABLE "orders"."orders" DROP CONSTRAINT "orders_amounts_check";

-- Champs figés d'une commande : ceux du S5-T02, plus la réduction et le code coupon.
CREATE OR REPLACE FUNCTION "orders"."orders_frozen_fields"() RETURNS trigger
    LANGUAGE plpgsql AS $$
BEGIN
    IF NEW."status" IS DISTINCT FROM OLD."status" AND NOT (
        (OLD."status" = 'PENDING_PAYMENT' AND NEW."status" IN ('CONFIRMED', 'CANCELLED'))
        OR (OLD."status" = 'CONFIRMED' AND NEW."status" IN ('PREPARING', 'CANCELLED'))
        OR (OLD."status" = 'PREPARING' AND NEW."status" IN ('SHIPPED', 'CANCELLED'))
        OR (OLD."status" = 'SHIPPED' AND NEW."status" = 'DELIVERED')
    ) THEN
        RAISE EXCEPTION 'changement de statut interdit : % → %', OLD."status", NEW."status"
            USING ERRCODE = 'check_violation';
    END IF;
    IF NEW."payment_due_at" IS NOT NULL
        AND (OLD."payment_due_at" IS NULL OR NEW."payment_due_at" > OLD."payment_due_at") THEN
        RAISE EXCEPTION 'échéance de paiement : jamais repoussée' USING ERRCODE = 'check_violation';
    END IF;
    IF OLD."cancelled_at" IS NOT NULL AND (
        NEW."cancelled_at" IS DISTINCT FROM OLD."cancelled_at"
        OR NEW."cancel_reason" IS DISTINCT FROM OLD."cancel_reason") THEN
        RAISE EXCEPTION 'annulation figée' USING ERRCODE = 'check_violation';
    END IF;
    IF NEW."reference" IS DISTINCT FROM OLD."reference"
        OR NEW."request_hash" IS DISTINCT FROM OLD."request_hash"
        OR NEW."account_id" IS DISTINCT FROM OLD."account_id"
        OR NEW."idempotency_key" IS DISTINCT FROM OLD."idempotency_key"
        OR NEW."payment_method" IS DISTINCT FROM OLD."payment_method"
        OR NEW."payment_phone" IS DISTINCT FROM OLD."payment_phone"
        OR NEW."subtotal" IS DISTINCT FROM OLD."subtotal"
        OR NEW."discount" IS DISTINCT FROM OLD."discount"
        OR NEW."coupon_code" IS DISTINCT FROM OLD."coupon_code"
        OR NEW."delivery_fee" IS DISTINCT FROM OLD."delivery_fee"
        OR NEW."total" IS DISTINCT FROM OLD."total"
        OR NEW."delivery_name" IS DISTINCT FROM OLD."delivery_name"
        OR NEW."delivery_phone" IS DISTINCT FROM OLD."delivery_phone"
        OR NEW."delivery_city_id" IS DISTINCT FROM OLD."delivery_city_id"
        OR NEW."delivery_city_name" IS DISTINCT FROM OLD."delivery_city_name"
        OR NEW."delivery_days_min" IS DISTINCT FROM OLD."delivery_days_min"
        OR NEW."delivery_days_max" IS DISTINCT FROM OLD."delivery_days_max"
        OR NEW."delivery_neighborhood" IS DISTINCT FROM OLD."delivery_neighborhood"
        OR NEW."delivery_landmark" IS DISTINCT FROM OLD."delivery_landmark"
        OR NEW."created_at" IS DISTINCT FROM OLD."created_at" THEN
        RAISE EXCEPTION 'commande figée : seul le statut change' USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
END;
$$;

-- Coupons : code en majuscules, valeurs cohérentes, compteur jamais au-delà de la limite (BR-030).
ALTER TABLE "orders"."coupons"
    ADD CONSTRAINT "coupons_code_check" CHECK ("code" ~ '^[A-Z0-9][A-Z0-9-]{2,18}[A-Z0-9]$'),
    ADD CONSTRAINT "coupons_value_check" CHECK (
        ("kind" = 'PERCENT' AND "value" BETWEEN 1 AND 90)
        OR ("kind" = 'FIXED' AND "value" BETWEEN 1 AND 10000000)
    ),
    ADD CONSTRAINT "coupons_max_discount_check" CHECK (
        "max_discount" IS NULL OR ("kind" = 'PERCENT' AND "max_discount" > 0)
    ),
    ADD CONSTRAINT "coupons_min_subtotal_check" CHECK ("min_subtotal" IS NULL OR "min_subtotal" >= 0),
    ADD CONSTRAINT "coupons_dates_check" CHECK ("ends_at" IS NULL OR "ends_at" > "starts_at"),
    ADD CONSTRAINT "coupons_limits_check" CHECK (
        ("usage_limit" IS NULL OR "usage_limit" > 0)
        AND ("per_account_limit" IS NULL OR "per_account_limit" > 0)
        AND "used_count" >= 0
        AND ("usage_limit" IS NULL OR "used_count" <= "usage_limit")
    );

-- Une fois créé, un coupon ne change pas de règles : seuls l'activation et le compteur changent ; jamais supprimé.
CREATE FUNCTION "orders"."coupons_frozen_rules"() RETURNS trigger
    LANGUAGE plpgsql AS $$
BEGIN
    IF NEW."id" IS DISTINCT FROM OLD."id"
        OR NEW."code" IS DISTINCT FROM OLD."code"
        OR NEW."kind" IS DISTINCT FROM OLD."kind"
        OR NEW."value" IS DISTINCT FROM OLD."value"
        OR NEW."max_discount" IS DISTINCT FROM OLD."max_discount"
        OR NEW."min_subtotal" IS DISTINCT FROM OLD."min_subtotal"
        OR NEW."starts_at" IS DISTINCT FROM OLD."starts_at"
        OR NEW."ends_at" IS DISTINCT FROM OLD."ends_at"
        OR NEW."usage_limit" IS DISTINCT FROM OLD."usage_limit"
        OR NEW."per_account_limit" IS DISTINCT FROM OLD."per_account_limit"
        OR NEW."stackable_with_sales" IS DISTINCT FROM OLD."stackable_with_sales"
        OR NEW."created_by" IS DISTINCT FROM OLD."created_by"
        OR NEW."created_at" IS DISTINCT FROM OLD."created_at" THEN
        RAISE EXCEPTION 'coupon figé : seuls l''activation et le compteur changent' USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER "coupons_frozen_rules"
    BEFORE UPDATE ON "orders"."coupons"
    FOR EACH ROW EXECUTE FUNCTION "orders"."coupons_frozen_rules"();

CREATE TRIGGER "coupons_no_delete"
    BEFORE DELETE ON "orders"."coupons"
    FOR EACH ROW EXECUTE FUNCTION "orders"."no_delete"();

CREATE TRIGGER "coupons_no_truncate"
    BEFORE TRUNCATE ON "orders"."coupons"
    FOR EACH STATEMENT EXECUTE FUNCTION "orders"."no_delete"();

-- Utilisation : montant positif ; seule la date de remise (annulation) peut être posée, une fois ; jamais supprimée.
ALTER TABLE "orders"."coupon_redemptions"
    ADD CONSTRAINT "coupon_redemptions_amount_check" CHECK ("amount" > 0);

CREATE FUNCTION "orders"."coupon_redemptions_release_only"() RETURNS trigger
    LANGUAGE plpgsql AS $$
BEGIN
    IF NEW."id" IS DISTINCT FROM OLD."id"
        OR NEW."coupon_id" IS DISTINCT FROM OLD."coupon_id"
        OR NEW."order_id" IS DISTINCT FROM OLD."order_id"
        OR NEW."account_id" IS DISTINCT FROM OLD."account_id"
        OR NEW."amount" IS DISTINCT FROM OLD."amount"
        OR NEW."created_at" IS DISTINCT FROM OLD."created_at"
        OR OLD."released_at" IS NOT NULL
        OR NEW."released_at" IS NULL THEN
        RAISE EXCEPTION 'utilisation de coupon : seule la remise est permise, une fois'
            USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER "coupon_redemptions_release_only"
    BEFORE UPDATE ON "orders"."coupon_redemptions"
    FOR EACH ROW EXECUTE FUNCTION "orders"."coupon_redemptions_release_only"();

CREATE TRIGGER "coupon_redemptions_no_delete"
    BEFORE DELETE ON "orders"."coupon_redemptions"
    FOR EACH ROW EXECUTE FUNCTION "orders"."no_delete"();

CREATE TRIGGER "coupon_redemptions_no_truncate"
    BEFORE TRUNCATE ON "orders"."coupon_redemptions"
    FOR EACH STATEMENT EXECUTE FUNCTION "orders"."no_delete"();

-- Filet de sécurité : toute commande qui passe à « annulée » rend l'utilisation de son coupon, quel que soit le code qui
-- l'annule (y compris une version précédente de l'API pendant un déploiement). L'API le fait déjà avant de changer le
-- statut ; dans ce cas, il n'y a plus rien à rendre ici.
CREATE FUNCTION "orders"."release_coupon_on_cancel"() RETURNS trigger
    LANGUAGE plpgsql AS $$
DECLARE
    use_coupon UUID;
BEGIN
    IF NEW."status" = 'CANCELLED' AND OLD."status" IS DISTINCT FROM 'CANCELLED' THEN
        UPDATE "orders"."coupon_redemptions"
            SET "released_at" = COALESCE(NEW."cancelled_at", CURRENT_TIMESTAMP)
            WHERE "order_id" = NEW."id" AND "released_at" IS NULL
            RETURNING "coupon_id" INTO use_coupon;
        IF use_coupon IS NOT NULL THEN
            UPDATE "orders"."coupons" SET "used_count" = "used_count" - 1, "updated_at" = CURRENT_TIMESTAMP
                WHERE "id" = use_coupon;
        END IF;
    END IF;
    RETURN NULL;
END;
$$;

CREATE TRIGGER "orders_release_coupon_on_cancel"
    AFTER UPDATE OF "status" ON "orders"."orders"
    FOR EACH ROW EXECUTE FUNCTION "orders"."release_coupon_on_cancel"();
