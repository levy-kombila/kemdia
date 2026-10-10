-- Commandes (S5-T02, ADR-0024) : schéma "orders". Migration d'ajout seulement.

-- CreateEnum
CREATE TYPE "orders"."order_status" AS ENUM ('PENDING_PAYMENT', 'CONFIRMED', 'PREPARING', 'SHIPPED', 'DELIVERED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "orders"."payment_method" AS ENUM ('AIRTEL', 'MOOV', 'COD');

-- CreateEnum
CREATE TYPE "orders"."cancel_reason" AS ENUM ('CLIENT', 'PAYMENT_EXPIRED');

-- CreateTable
CREATE TABLE "orders"."orders" (
    "id" UUID NOT NULL,
    "reference" VARCHAR(10) NOT NULL,
    "account_id" UUID NOT NULL,
    "idempotency_key" UUID NOT NULL,
    "request_hash" CHAR(64) NOT NULL,
    "status" "orders"."order_status" NOT NULL,
    "payment_method" "orders"."payment_method" NOT NULL,
    "payment_phone" VARCHAR(13),
    "subtotal" INTEGER NOT NULL,
    "delivery_fee" INTEGER NOT NULL,
    "total" INTEGER NOT NULL,
    "delivery_name" VARCHAR(120) NOT NULL,
    "delivery_phone" VARCHAR(13) NOT NULL,
    "delivery_city_id" VARCHAR(40) NOT NULL,
    "delivery_city_name" VARCHAR(60) NOT NULL,
    "delivery_neighborhood" VARCHAR(80) NOT NULL,
    "delivery_landmark" VARCHAR(200) NOT NULL,
    "delivery_days_min" INTEGER NOT NULL,
    "delivery_days_max" INTEGER NOT NULL,
    "payment_due_at" TIMESTAMPTZ(3),
    "cancelled_at" TIMESTAMPTZ(3),
    "cancel_reason" "orders"."cancel_reason",
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "orders"."order_items" (
    "order_id" UUID NOT NULL,
    "variant_id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "title" VARCHAR(120) NOT NULL,
    "variant_name" VARCHAR(80) NOT NULL,
    "image" VARCHAR(300),
    "unit_price" INTEGER NOT NULL,
    "quantity" INTEGER NOT NULL,
    "line_total" INTEGER NOT NULL,
    "position" INTEGER NOT NULL,

    CONSTRAINT "order_items_pkey" PRIMARY KEY ("order_id","variant_id")
);

-- CreateTable
CREATE TABLE "orders"."order_status_history" (
    "id" UUID NOT NULL,
    "order_id" UUID NOT NULL,
    "status" "orders"."order_status" NOT NULL,
    "at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "order_status_history_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "orders_reference_key" ON "orders"."orders"("reference");

-- CreateIndex
CREATE INDEX "orders_account_id_created_at_idx" ON "orders"."orders"("account_id", "created_at");

-- CreateIndex
CREATE INDEX "orders_status_payment_due_at_idx" ON "orders"."orders"("status", "payment_due_at");

-- CreateIndex
CREATE UNIQUE INDEX "orders_account_id_idempotency_key_key" ON "orders"."orders"("account_id", "idempotency_key");

-- CreateIndex
CREATE INDEX "order_status_history_order_id_at_idx" ON "orders"."order_status_history"("order_id", "at");

-- AddForeignKey
ALTER TABLE "orders"."order_items" ADD CONSTRAINT "order_items_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"."orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders"."order_status_history" ADD CONSTRAINT "order_status_history_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"."orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ─── Règles que Prisma ne sait pas décrire (ajoutées à la main) ─────────────────────────────

-- Numéro de commande : « KMD- » + 6 caractères de l'alphabet sans 0/O ni 1/I (BR-042).
ALTER TABLE "orders"."orders"
    ADD CONSTRAINT "orders_request_hash_check" CHECK ("request_hash" ~ '^[0-9a-f]{64}$'),
    ADD CONSTRAINT "orders_reference_check" CHECK ("reference" ~ '^KMD-[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{6}$'),
    -- Montants entiers en FCFA (BR-004) : total = articles + livraison
    ADD CONSTRAINT "orders_amounts_check" CHECK ("subtotal" > 0 AND "delivery_fee" >= 0 AND "total" = "subtotal" + "delivery_fee"),
    ADD CONSTRAINT "orders_delivery_days_check" CHECK ("delivery_days_min" > 0 AND "delivery_days_max" >= "delivery_days_min"),
    -- Mobile Money : numéro +2410[67]… obligatoire ; à la livraison : aucun numéro de paiement
    ADD CONSTRAINT "orders_payment_phone_check" CHECK (
        ("payment_method" = 'COD' AND "payment_phone" IS NULL)
        OR ("payment_method" <> 'COD' AND "payment_phone" ~ '^\+2410[67][0-9]{7}$')
    ),
    ADD CONSTRAINT "orders_delivery_phone_check" CHECK ("delivery_phone" ~ '^\+2410[67][0-9]{7}$'),
    -- En attente de paiement ⇒ échéance connue
    ADD CONSTRAINT "orders_payment_due_check" CHECK ("status" <> 'PENDING_PAYMENT' OR "payment_due_at" IS NOT NULL),
    -- Annulée ⇔ date et raison d'annulation
    ADD CONSTRAINT "orders_cancelled_check" CHECK (
        ("status" = 'CANCELLED') = ("cancelled_at" IS NOT NULL)
        AND ("cancelled_at" IS NULL) = ("cancel_reason" IS NULL)
    );

-- Ligne : quantité de 1 à 20, prix entier positif, total de ligne exact
ALTER TABLE "orders"."order_items"
    ADD CONSTRAINT "order_items_amounts_check" CHECK (
        "quantity" BETWEEN 1 AND 20 AND "unit_price" > 0 AND "line_total" = "unit_price" * "quantity"
    );

-- Une commande ne change que de statut, et seulement dans l'ordre prévu : numéro, compte, montants, adresse et paiement
-- sont figés ; une commande annulée ou livrée ne change plus ; l'échéance de paiement ne recule jamais.
CREATE FUNCTION "orders"."orders_frozen_fields"() RETURNS trigger
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
    -- Échéance de paiement : peut être effacée (paiement reçu) ou avancée, jamais repoussée
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

CREATE TRIGGER "orders_frozen_fields"
    BEFORE UPDATE ON "orders"."orders"
    FOR EACH ROW EXECUTE FUNCTION "orders"."orders_frozen_fields"();

-- Les commandes ne sont jamais supprimées (preuve d'achat, factures FR-015).
CREATE FUNCTION "orders"."no_delete"() RETURNS trigger
    LANGUAGE plpgsql AS $$
BEGIN
    RAISE EXCEPTION 'suppression interdite : %', TG_TABLE_NAME USING ERRCODE = 'insufficient_privilege';
END;
$$;

CREATE TRIGGER "orders_no_delete"
    BEFORE DELETE ON "orders"."orders"
    FOR EACH ROW EXECUTE FUNCTION "orders"."no_delete"();

-- Lignes de commande et historique : en ajout seul (aucune modification, aucune suppression).
CREATE FUNCTION "orders"."append_only"() RETURNS trigger
    LANGUAGE plpgsql AS $$
BEGIN
    RAISE EXCEPTION 'table en ajout seul : %', TG_TABLE_NAME USING ERRCODE = 'insufficient_privilege';
END;
$$;

CREATE TRIGGER "order_items_append_only"
    BEFORE UPDATE OR DELETE ON "orders"."order_items"
    FOR EACH ROW EXECUTE FUNCTION "orders"."append_only"();

CREATE TRIGGER "order_status_history_append_only"
    BEFORE UPDATE OR DELETE ON "orders"."order_status_history"
    FOR EACH ROW EXECUTE FUNCTION "orders"."append_only"();

CREATE TRIGGER "orders_no_truncate"
    BEFORE TRUNCATE ON "orders"."orders"
    FOR EACH STATEMENT EXECUTE FUNCTION "orders"."no_delete"();

CREATE TRIGGER "order_items_no_truncate"
    BEFORE TRUNCATE ON "orders"."order_items"
    FOR EACH STATEMENT EXECUTE FUNCTION "orders"."append_only"();

CREATE TRIGGER "order_status_history_no_truncate"
    BEFORE TRUNCATE ON "orders"."order_status_history"
    FOR EACH STATEMENT EXECUTE FUNCTION "orders"."append_only"();
