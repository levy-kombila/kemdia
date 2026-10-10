-- Paiements (S5-T04, ADR-0026) : réglage du paiement à la livraison (schéma "orders"), paiements et remboursements
-- (schéma "payments"). Migration d'ajout seulement.

-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "payments";

-- AlterEnum
ALTER TYPE "orders"."cancel_reason" ADD VALUE 'ADMIN';

-- AlterTable
ALTER TABLE "orders"."orders" ADD COLUMN     "paid_at" TIMESTAMPTZ(3);

-- CreateEnum
CREATE TYPE "payments"."payment_status" AS ENUM ('PENDING', 'SUCCEEDED', 'FAILED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "payments"."payment_channel" AS ENUM ('AIRTEL', 'MOOV', 'COD');

-- CreateEnum
CREATE TYPE "payments"."refund_status" AS ENUM ('TO_DO', 'DONE');

-- CreateEnum
CREATE TYPE "payments"."refund_reason" AS ENUM ('ADMIN_CANCEL', 'UNEXPECTED_PAYMENT');

-- CreateTable
CREATE TABLE "orders"."cod_settings" (
    "id" SMALLINT NOT NULL DEFAULT 1,
    "zones" VARCHAR(10)[],
    "max_total" INTEGER NOT NULL,
    "updated_by" UUID,
    "updated_at" TIMESTAMPTZ(3),

    CONSTRAINT "cod_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payments"."payments" (
    "id" UUID NOT NULL,
    "order_id" UUID NOT NULL,
    "account_id" UUID NOT NULL,
    "method" "payments"."payment_channel" NOT NULL,
    "amount" INTEGER NOT NULL,
    "phone" VARCHAR(13),
    "status" "payments"."payment_status" NOT NULL,
    "attempt" SMALLINT NOT NULL,
    "provider" VARCHAR(20) NOT NULL,
    "provider_ref" VARCHAR(100),
    "failure_reason" VARCHAR(60),
    "collected_by" UUID,
    "expires_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMPTZ(3),
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payments"."refunds" (
    "id" UUID NOT NULL,
    "payment_id" UUID NOT NULL,
    "order_id" UUID NOT NULL,
    "order_reference" VARCHAR(10) NOT NULL,
    "amount" INTEGER NOT NULL,
    "method" "payments"."payment_channel" NOT NULL,
    "phone" VARCHAR(13) NOT NULL,
    "reason" "payments"."refund_reason" NOT NULL,
    "status" "payments"."refund_status" NOT NULL,
    "external_reference" VARCHAR(100),
    "done_by" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "done_at" TIMESTAMPTZ(3),
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "refunds_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "payments_provider_ref_key" ON "payments"."payments"("provider_ref");

-- CreateIndex
CREATE INDEX "payments_status_expires_at_idx" ON "payments"."payments"("status", "expires_at");

-- CreateIndex
CREATE INDEX "payments_phone_created_at_idx" ON "payments"."payments"("phone", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "payments_order_id_attempt_key" ON "payments"."payments"("order_id", "attempt");

-- CreateIndex
CREATE UNIQUE INDEX "refunds_payment_id_key" ON "payments"."refunds"("payment_id");

-- CreateIndex
CREATE UNIQUE INDEX "refunds_external_reference_key" ON "payments"."refunds"("external_reference");

-- CreateIndex
CREATE INDEX "refunds_status_created_at_idx" ON "payments"."refunds"("status", "created_at");

-- CreateIndex
CREATE INDEX "refunds_order_id_idx" ON "payments"."refunds"("order_id");

-- AddForeignKey
ALTER TABLE "payments"."refunds" ADD CONSTRAINT "refunds_payment_id_fkey" FOREIGN KEY ("payment_id") REFERENCES "payments"."payments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ─── Règles que Prisma ne sait pas décrire (ajoutées à la main) ─────────────────────────────

-- Commande payée : date posée une seule fois, jamais sur une commande annulée (relecture de sécurité du S5-T04 : une
-- commande encaissée ne doit plus pouvoir être annulée par erreur sans trace).
CREATE FUNCTION "orders"."orders_paid_at_frozen"() RETURNS trigger
    LANGUAGE plpgsql AS $$
BEGIN
    IF OLD."paid_at" IS NOT NULL AND NEW."paid_at" IS DISTINCT FROM OLD."paid_at" THEN
        RAISE EXCEPTION 'date de paiement figée' USING ERRCODE = 'check_violation';
    END IF;
    IF OLD."paid_at" IS NULL AND NEW."paid_at" IS NOT NULL AND NEW."status" = 'CANCELLED' THEN
        RAISE EXCEPTION 'commande annulée : pas de paiement à noter' USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER "orders_paid_at_frozen"
    BEFORE UPDATE ON "orders"."orders"
    FOR EACH ROW EXECUTE FUNCTION "orders"."orders_paid_at_frozen"();

-- Réglage du paiement à la livraison : une seule ligne, zones connues, plafond borné.
ALTER TABLE "orders"."cod_settings"
    ADD CONSTRAINT "cod_settings_single_row_check" CHECK ("id" = 1),
    ADD CONSTRAINT "cod_settings_zones_check" CHECK (
        "zones" IS NOT NULL
        AND "zones" <@ ARRAY['zone_1', 'zone_2', 'zone_3', 'zone_4']::VARCHAR(10)[]
        AND array_position("zones", NULL) IS NULL
    ),
    ADD CONSTRAINT "cod_settings_max_total_check" CHECK ("max_total" BETWEEN 0 AND 10000000),
    ADD CONSTRAINT "cod_settings_updated_check" CHECK (("updated_by" IS NULL) = ("updated_at" IS NULL));

-- Valeurs de départ = valeurs provisoires d'avant (Grand Libreville, 100 000 FCFA livraison comprise).
INSERT INTO "orders"."cod_settings" ("id", "zones", "max_total") VALUES (1, ARRAY['zone_1']::VARCHAR(10)[], 100000);

-- Le réglage ne s'efface pas (la commande en a besoin).
CREATE TRIGGER "cod_settings_no_delete"
    BEFORE DELETE ON "orders"."cod_settings"
    FOR EACH ROW EXECUTE FUNCTION "orders"."no_delete"();

CREATE TRIGGER "cod_settings_no_truncate"
    BEFORE TRUNCATE ON "orders"."cod_settings"
    FOR EACH STATEMENT EXECUTE FUNCTION "orders"."no_delete"();

-- Paiement : montant entier positif (BR-004), 3 essais au plus, numéro Mobile Money ou encaissement en espèces.
ALTER TABLE "payments"."payments"
    ADD CONSTRAINT "payments_amount_check" CHECK ("amount" > 0),
    ADD CONSTRAINT "payments_attempt_check" CHECK ("attempt" BETWEEN 1 AND 10),
    ADD CONSTRAINT "payments_provider_check" CHECK ("provider" ~ '^[a-z_]{1,20}$'),
    ADD CONSTRAINT "payments_channel_check" CHECK (
        ("method" = 'COD' AND "phone" IS NULL AND "attempt" = 1 AND "status" = 'SUCCEEDED'
            AND "collected_by" IS NOT NULL AND "provider_ref" IS NULL)
        OR ("method" <> 'COD' AND "phone" ~ '^\+2410[67][0-9]{7}$' AND "collected_by" IS NULL)
    ),
    -- Terminé ⇔ date de fin
    ADD CONSTRAINT "payments_completed_check" CHECK (("status" = 'PENDING') = ("completed_at" IS NULL)),
    ADD CONSTRAINT "payments_provider_ref_check" CHECK ("provider_ref" IS NULL OR "provider_ref" ~ '^[A-Za-z0-9._:-]{1,100}$');

-- Un paiement ne change que de statut, et seulement dans l'ordre prévu ; un essai expiré ou échoué peut encore
-- réussir (l'argent est arrivé en retard : il est alors remboursé ou confirme la commande). Le reste est figé.
CREATE FUNCTION "payments"."payments_frozen_fields"() RETURNS trigger
    LANGUAGE plpgsql AS $$
BEGIN
    IF NEW."status" IS DISTINCT FROM OLD."status" AND NOT (
        (OLD."status" = 'PENDING' AND NEW."status" IN ('SUCCEEDED', 'FAILED', 'EXPIRED'))
        OR (OLD."status" IN ('EXPIRED', 'FAILED') AND NEW."status" = 'SUCCEEDED')
    ) THEN
        RAISE EXCEPTION 'changement de statut interdit : % → %', OLD."status", NEW."status"
            USING ERRCODE = 'check_violation';
    END IF;
    IF NEW."status" IS NOT DISTINCT FROM OLD."status" AND (
        NEW."completed_at" IS DISTINCT FROM OLD."completed_at"
        OR NEW."failure_reason" IS DISTINCT FROM OLD."failure_reason") THEN
        RAISE EXCEPTION 'fin de l''essai figée' USING ERRCODE = 'check_violation';
    END IF;
    IF OLD."provider_ref" IS NOT NULL AND NEW."provider_ref" IS DISTINCT FROM OLD."provider_ref" THEN
        RAISE EXCEPTION 'référence du fournisseur figée' USING ERRCODE = 'check_violation';
    END IF;
    IF NEW."order_id" IS DISTINCT FROM OLD."order_id"
        OR NEW."account_id" IS DISTINCT FROM OLD."account_id"
        OR NEW."method" IS DISTINCT FROM OLD."method"
        OR NEW."amount" IS DISTINCT FROM OLD."amount"
        OR NEW."phone" IS DISTINCT FROM OLD."phone"
        OR NEW."attempt" IS DISTINCT FROM OLD."attempt"
        OR NEW."provider" IS DISTINCT FROM OLD."provider"
        OR NEW."collected_by" IS DISTINCT FROM OLD."collected_by"
        OR NEW."expires_at" IS DISTINCT FROM OLD."expires_at"
        OR NEW."created_at" IS DISTINCT FROM OLD."created_at"
        OR NEW."id" IS DISTINCT FROM OLD."id" THEN
        RAISE EXCEPTION 'paiement figé : seul le statut change' USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER "payments_frozen_fields"
    BEFORE UPDATE ON "payments"."payments"
    FOR EACH ROW EXECUTE FUNCTION "payments"."payments_frozen_fields"();

-- Remboursement : vers le numéro Mobile Money payé ; « fait » ⇔ référence, administrateur et date.
ALTER TABLE "payments"."refunds"
    ADD CONSTRAINT "refunds_amount_check" CHECK ("amount" > 0),
    ADD CONSTRAINT "refunds_order_reference_check" CHECK ("order_reference" ~ '^KMD-[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{6}$'),
    ADD CONSTRAINT "refunds_channel_check" CHECK ("method" <> 'COD' AND "phone" ~ '^\+2410[67][0-9]{7}$'),
    ADD CONSTRAINT "refunds_done_check" CHECK (
        ("status" = 'DONE') = ("done_at" IS NOT NULL)
        AND ("done_at" IS NULL) = ("done_by" IS NULL)
        AND ("done_at" IS NULL) = ("external_reference" IS NULL)
    ),
    ADD CONSTRAINT "refunds_external_reference_check" CHECK (
        "external_reference" IS NULL OR "external_reference" ~ '^[A-Za-z0-9._/-]{3,100}$'
    );

-- Un remboursement va vers le numéro qui a payé, pour la commande de ce paiement, et seulement pour un paiement reçu.
CREATE FUNCTION "payments"."refunds_match_payment"() RETURNS trigger
    LANGUAGE plpgsql AS $$
DECLARE
    paid RECORD;
BEGIN
    SELECT "order_id", "method", "phone", "amount", "status" INTO paid
        FROM "payments"."payments" WHERE "id" = NEW."payment_id";
    IF paid."status" <> 'SUCCEEDED' OR paid."order_id" <> NEW."order_id" OR paid."method" <> NEW."method"
        OR paid."phone" IS DISTINCT FROM NEW."phone" THEN
        RAISE EXCEPTION 'remboursement sans paiement reçu correspondant' USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER "refunds_match_payment"
    BEFORE INSERT ON "payments"."refunds"
    FOR EACH ROW EXECUTE FUNCTION "payments"."refunds_match_payment"();

-- Un remboursement passe une seule fois de « à faire » à « fait », puis ne change plus.
CREATE FUNCTION "payments"."refunds_frozen_fields"() RETURNS trigger
    LANGUAGE plpgsql AS $$
BEGIN
    IF OLD."status" = 'DONE' THEN
        RAISE EXCEPTION 'remboursement fait : figé' USING ERRCODE = 'check_violation';
    END IF;
    IF NEW."id" IS DISTINCT FROM OLD."id"
        OR NEW."payment_id" IS DISTINCT FROM OLD."payment_id"
        OR NEW."order_id" IS DISTINCT FROM OLD."order_id"
        OR NEW."order_reference" IS DISTINCT FROM OLD."order_reference"
        OR NEW."amount" IS DISTINCT FROM OLD."amount"
        OR NEW."method" IS DISTINCT FROM OLD."method"
        OR NEW."phone" IS DISTINCT FROM OLD."phone"
        OR NEW."reason" IS DISTINCT FROM OLD."reason"
        OR NEW."created_at" IS DISTINCT FROM OLD."created_at" THEN
        RAISE EXCEPTION 'remboursement figé : seul son suivi change' USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER "refunds_frozen_fields"
    BEFORE UPDATE ON "payments"."refunds"
    FOR EACH ROW EXECUTE FUNCTION "payments"."refunds_frozen_fields"();

-- Paiements et remboursements ne s'effacent jamais (preuve des sommes reçues et rendues).
CREATE FUNCTION "payments"."no_delete"() RETURNS trigger
    LANGUAGE plpgsql AS $$
BEGIN
    RAISE EXCEPTION 'suppression interdite : %', TG_TABLE_NAME USING ERRCODE = 'insufficient_privilege';
END;
$$;

CREATE TRIGGER "payments_no_delete"
    BEFORE DELETE ON "payments"."payments"
    FOR EACH ROW EXECUTE FUNCTION "payments"."no_delete"();

CREATE TRIGGER "payments_no_truncate"
    BEFORE TRUNCATE ON "payments"."payments"
    FOR EACH STATEMENT EXECUTE FUNCTION "payments"."no_delete"();

CREATE TRIGGER "refunds_no_delete"
    BEFORE DELETE ON "payments"."refunds"
    FOR EACH ROW EXECUTE FUNCTION "payments"."no_delete"();

CREATE TRIGGER "refunds_no_truncate"
    BEFORE TRUNCATE ON "payments"."refunds"
    FOR EACH STATEMENT EXECUTE FUNCTION "payments"."no_delete"();
