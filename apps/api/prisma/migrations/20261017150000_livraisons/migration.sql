-- Livraisons (S7-T01, ADR-0040 ; BR-021). Migration d'ajout : la version précédente de l'API ignore le nouveau schéma
-- "shipping" ; elle n'utilise pas non plus les nouvelles valeurs des énumérations ni le nouveau passage
-- expédiée → annulée.

-- AlterEnum : livraison impossible, commande annulée par un administrateur
ALTER TYPE "orders"."cancel_reason" ADD VALUE 'DELIVERY_FAILED';
-- AlterEnum : remboursement d'une commande payée dont la livraison a échoué
ALTER TYPE "payments"."refund_reason" ADD VALUE 'DELIVERY_CANCEL';

-- Commande figée : une commande EXPÉDIÉE peut maintenant être annulée (livraison impossible, S7-T01) ; tout le reste
-- est repris tel quel du S5-T03.
CREATE OR REPLACE FUNCTION "orders"."orders_frozen_fields"() RETURNS trigger
    LANGUAGE plpgsql AS $$
BEGIN
    IF NEW."status" IS DISTINCT FROM OLD."status" AND NOT (
        (OLD."status" = 'PENDING_PAYMENT' AND NEW."status" IN ('CONFIRMED', 'CANCELLED'))
        OR (OLD."status" = 'CONFIRMED' AND NEW."status" IN ('PREPARING', 'CANCELLED'))
        OR (OLD."status" = 'PREPARING' AND NEW."status" IN ('SHIPPED', 'CANCELLED'))
        OR (OLD."status" = 'SHIPPED' AND NEW."status" IN ('DELIVERED', 'CANCELLED'))
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


-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "shipping";

-- CreateEnum
CREATE TYPE "shipping"."shipment_status" AS ENUM ('IN_TRANSIT', 'DELIVERED', 'FAILED', 'CANCELLED');

-- CreateTable
CREATE TABLE "shipping"."delivery_tariffs" (
    "zone_id" VARCHAR(10) NOT NULL,
    "base_fee" INTEGER NOT NULL,
    "free_threshold" INTEGER NOT NULL,
    "days_min" SMALLINT NOT NULL,
    "days_max" SMALLINT NOT NULL,
    "updated_by" UUID,
    "updated_at" TIMESTAMPTZ(3),

    CONSTRAINT "delivery_tariffs_pkey" PRIMARY KEY ("zone_id")
);

-- CreateTable
CREATE TABLE "shipping"."shipments" (
    "id" UUID NOT NULL,
    "order_id" UUID NOT NULL,
    "order_reference" VARCHAR(10) NOT NULL,
    "status" "shipping"."shipment_status" NOT NULL DEFAULT 'IN_TRANSIT',
    "carrier" VARCHAR(20) NOT NULL,
    "attempt" SMALLINT NOT NULL DEFAULT 1,
    "city_name" VARCHAR(60) NOT NULL,
    "delivery_fee" INTEGER NOT NULL,
    "kemdia_share" INTEGER NOT NULL,
    "carrier_share" INTEGER NOT NULL,
    "failure_reason" VARCHAR(200),
    "handed_over_at" TIMESTAMPTZ(3) NOT NULL,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "shipments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shipping"."shipment_events" (
    "id" UUID NOT NULL,
    "shipment_id" UUID NOT NULL,
    "status" "shipping"."shipment_status" NOT NULL,
    "note" VARCHAR(200),
    "actor_id" UUID NOT NULL,
    "at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "shipment_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "shipments_order_id_key" ON "shipping"."shipments"("order_id");

-- CreateIndex
CREATE UNIQUE INDEX "shipments_order_reference_key" ON "shipping"."shipments"("order_reference");

-- CreateIndex
CREATE INDEX "shipments_status_updated_at_idx" ON "shipping"."shipments"("status", "updated_at");

-- CreateIndex
CREATE INDEX "shipment_events_shipment_id_at_idx" ON "shipping"."shipment_events"("shipment_id", "at");

-- AddForeignKey
ALTER TABLE "shipping"."shipment_events" ADD CONSTRAINT "shipment_events_shipment_id_fkey" FOREIGN KEY ("shipment_id") REFERENCES "shipping"."shipments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ─── Règles que Prisma ne sait pas décrire (ajoutées à la main) ─────────────────────────────

-- Barème : zones connues, montants et délais dans les bornes du contrat (SHIPPING_LIMITS), minimum ≤ maximum.
ALTER TABLE "shipping"."delivery_tariffs"
    ADD CONSTRAINT "delivery_tariffs_zone_check" CHECK ("zone_id" IN ('zone_1', 'zone_2', 'zone_3', 'zone_4')),
    ADD CONSTRAINT "delivery_tariffs_amounts_check" CHECK (
        "base_fee" BETWEEN 0 AND 100000 AND "free_threshold" BETWEEN 0 AND 10000000
    ),
    ADD CONSTRAINT "delivery_tariffs_days_check" CHECK (
        "days_min" BETWEEN 0 AND 30 AND "days_max" BETWEEN 0 AND 30 AND "days_min" <= "days_max"
    );

-- Barème de départ : celui du contrat (packages/contracts/src/delivery.ts), jusqu'à présent écrit dans le code.
INSERT INTO "shipping"."delivery_tariffs" ("zone_id", "base_fee", "free_threshold", "days_min", "days_max") VALUES
    ('zone_1', 0, 25000, 1, 2),
    ('zone_2', 2000, 50000, 2, 3),
    ('zone_3', 3000, 75000, 3, 4),
    ('zone_4', 4000, 100000, 4, 7);

-- Parts des frais (BR-021) : Kemdia 15 % arrondis à l'entier inférieur, le transporteur le reste.
ALTER TABLE "shipping"."shipments"
    ADD CONSTRAINT "shipments_shares_check" CHECK (
        "delivery_fee" >= 0
        AND "kemdia_share" = ("delivery_fee" * 15) / 100
        AND "carrier_share" = "delivery_fee" - "kemdia_share"
    ),
    ADD CONSTRAINT "shipments_attempt_check" CHECK ("attempt" BETWEEN 1 AND 20),
    ADD CONSTRAINT "shipments_carrier_check" CHECK (length("carrier") > 0),
    -- Motif obligatoire en échec, gardé après une annulation, effacé par une nouvelle tentative
    ADD CONSTRAINT "shipments_failure_check" CHECK (
        ("status" <> 'FAILED' OR "failure_reason" IS NOT NULL)
        AND ("status" NOT IN ('IN_TRANSIT', 'DELIVERED') OR "failure_reason" IS NULL)
    );

-- Expédition figée : seuls le statut (passages permis), la tentative (jamais en arrière), le motif d'échec et la date
-- de mise à jour changent ; jamais effacée.
CREATE OR REPLACE FUNCTION "shipping"."shipments_frozen_fields"() RETURNS trigger
    LANGUAGE plpgsql AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN
        RAISE EXCEPTION 'expédition : jamais effacée' USING ERRCODE = 'check_violation';
    END IF;
    IF NEW."status" IS DISTINCT FROM OLD."status" AND NOT (
        (OLD."status" = 'IN_TRANSIT' AND NEW."status" IN ('DELIVERED', 'FAILED'))
        OR (OLD."status" = 'FAILED' AND NEW."status" IN ('IN_TRANSIT', 'CANCELLED'))
    ) THEN
        RAISE EXCEPTION 'changement de statut interdit : % → %', OLD."status", NEW."status"
            USING ERRCODE = 'check_violation';
    END IF;
    IF NEW."attempt" < OLD."attempt" THEN
        RAISE EXCEPTION 'tentative de livraison : jamais en arrière' USING ERRCODE = 'check_violation';
    END IF;
    IF NEW."id" IS DISTINCT FROM OLD."id"
        OR NEW."order_id" IS DISTINCT FROM OLD."order_id"
        OR NEW."order_reference" IS DISTINCT FROM OLD."order_reference"
        OR NEW."carrier" IS DISTINCT FROM OLD."carrier"
        OR NEW."city_name" IS DISTINCT FROM OLD."city_name"
        OR NEW."delivery_fee" IS DISTINCT FROM OLD."delivery_fee"
        OR NEW."kemdia_share" IS DISTINCT FROM OLD."kemdia_share"
        OR NEW."carrier_share" IS DISTINCT FROM OLD."carrier_share"
        OR NEW."handed_over_at" IS DISTINCT FROM OLD."handed_over_at" THEN
        RAISE EXCEPTION 'expédition figée : seul le suivi change' USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER "shipments_frozen_fields"
    BEFORE UPDATE OR DELETE ON "shipping"."shipments"
    FOR EACH ROW EXECUTE FUNCTION "shipping"."shipments_frozen_fields"();

-- Historique en ajout seul.
CREATE OR REPLACE FUNCTION "shipping"."shipment_events_append_only"() RETURNS trigger
    LANGUAGE plpgsql AS $$
BEGIN
    RAISE EXCEPTION 'historique d''expédition : ajout seul' USING ERRCODE = 'check_violation';
END;
$$;

CREATE TRIGGER "shipment_events_append_only"
    BEFORE UPDATE OR DELETE ON "shipping"."shipment_events"
    FOR EACH ROW EXECUTE FUNCTION "shipping"."shipment_events_append_only"();
