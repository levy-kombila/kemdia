-- Factures et avoirs (S5-T06, ADR-0028) : schéma "payments". Migration d'ajout seulement.

-- CreateEnum
CREATE TYPE "payments"."document_kind" AS ENUM ('INVOICE', 'CREDIT_NOTE');

-- CreateTable
CREATE TABLE "payments"."billing_settings" (
    "id" SMALLINT NOT NULL DEFAULT 1,
    "legal_name" VARCHAR(120) NOT NULL,
    "address" VARCHAR(200) NOT NULL,
    "city" VARCHAR(60) NOT NULL,
    "phone" VARCHAR(30) NOT NULL,
    "email" VARCHAR(120) NOT NULL,
    "tax_id" VARCHAR(40) NOT NULL,
    "trade_register" VARCHAR(40) NOT NULL,
    "vat_mention" VARCHAR(120) NOT NULL,
    "updated_by" UUID,
    "updated_at" TIMESTAMPTZ(3),

    CONSTRAINT "billing_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payments"."invoice_counters" (
    "kind" "payments"."document_kind" NOT NULL,
    "year" SMALLINT NOT NULL,
    "last_number" INTEGER NOT NULL,

    CONSTRAINT "invoice_counters_pkey" PRIMARY KEY ("kind","year")
);

-- CreateTable
CREATE TABLE "payments"."invoices" (
    "id" UUID NOT NULL,
    "number" VARCHAR(20) NOT NULL,
    "kind" "payments"."document_kind" NOT NULL,
    "order_id" UUID NOT NULL,
    "order_reference" VARCHAR(10) NOT NULL,
    "account_id" UUID NOT NULL,
    "credited_invoice_id" UUID,
    "issued_at" TIMESTAMPTZ(3) NOT NULL,
    "subtotal" INTEGER NOT NULL,
    "discount" INTEGER NOT NULL,
    "delivery_fee" INTEGER NOT NULL,
    "total" INTEGER NOT NULL,
    "vat_mention" VARCHAR(120) NOT NULL,
    "seller" JSONB NOT NULL,
    "buyer" JSONB NOT NULL,
    "lines" JSONB NOT NULL,
    "payment_method" "payments"."payment_channel" NOT NULL,
    "payment_reference" VARCHAR(100),
    "email_attempts" INTEGER NOT NULL DEFAULT 0,
    "email_next_at" TIMESTAMPTZ(3),
    "email_sent_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "invoices_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "invoices_number_key" ON "payments"."invoices"("number");

-- CreateIndex
CREATE UNIQUE INDEX "invoices_credited_invoice_id_key" ON "payments"."invoices"("credited_invoice_id");

-- CreateIndex
CREATE INDEX "invoices_account_id_idx" ON "payments"."invoices"("account_id");

-- CreateIndex
CREATE INDEX "invoices_email_sent_at_email_next_at_idx" ON "payments"."invoices"("email_sent_at", "email_next_at");

-- CreateIndex
CREATE UNIQUE INDEX "invoices_order_id_kind_key" ON "payments"."invoices"("order_id", "kind");

-- ─── Règles que Prisma ne sait pas décrire (ajoutées à la main) ─────────────────────────────

-- Informations de l'entreprise : une seule ligne, valeurs de départ PROVISOIRES (à compléter par un administrateur).
ALTER TABLE "payments"."billing_settings"
    ADD CONSTRAINT "billing_settings_single_row_check" CHECK ("id" = 1),
    ADD CONSTRAINT "billing_settings_updated_check" CHECK (("updated_by" IS NULL) = ("updated_at" IS NULL));

INSERT INTO "payments"."billing_settings"
    ("id", "legal_name", "address", "city", "phone", "email", "tax_id", "trade_register", "vat_mention")
VALUES (1, 'Kemdia (raison sociale à compléter)', 'Adresse à compléter', 'Libreville', '+241 00 00 00 00',
        'support@kemdia.ga', 'NIF à compléter', 'RCCM à compléter', 'TVA non applicable');

-- Compteurs : un par type et par année ; le numéro ne fait qu'avancer d'un (aucun trou, aucun retour en arrière).
ALTER TABLE "payments"."invoice_counters"
    ADD CONSTRAINT "invoice_counters_year_check" CHECK ("year" BETWEEN 2026 AND 9999),
    ADD CONSTRAINT "invoice_counters_number_check" CHECK ("last_number" BETWEEN 1 AND 999999);

CREATE FUNCTION "payments"."invoice_counters_step"() RETURNS trigger
    LANGUAGE plpgsql AS $$
BEGIN
    IF NEW."kind" IS DISTINCT FROM OLD."kind" OR NEW."year" IS DISTINCT FROM OLD."year"
        OR NEW."last_number" <> OLD."last_number" + 1 THEN
        RAISE EXCEPTION 'compteur de factures : il n''avance que d''un' USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER "invoice_counters_step"
    BEFORE UPDATE ON "payments"."invoice_counters"
    FOR EACH ROW EXECUTE FUNCTION "payments"."invoice_counters_step"();

-- Facture : numéro au bon format pour son type, montants entiers cohérents (BR-004), avoir ⇔ facture annulée.
ALTER TABLE "payments"."invoices"
    ADD CONSTRAINT "invoices_number_check" CHECK (
        ("kind" = 'INVOICE' AND "number" ~ '^KMD-F-[0-9]{4}-[0-9]{6}$')
        OR ("kind" = 'CREDIT_NOTE' AND "number" ~ '^KMD-A-[0-9]{4}-[0-9]{6}$')
    ),
    ADD CONSTRAINT "invoices_order_reference_check" CHECK ("order_reference" ~ '^KMD-[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{6}$'),
    ADD CONSTRAINT "invoices_amounts_check" CHECK (
        "subtotal" > 0 AND "discount" >= 0 AND "delivery_fee" >= 0 AND "total" > 0
        AND "total" = "subtotal" - "discount" + "delivery_fee"
    ),
    ADD CONSTRAINT "invoices_credit_check" CHECK (("kind" = 'CREDIT_NOTE') = ("credited_invoice_id" IS NOT NULL)),
    ADD CONSTRAINT "invoices_email_check" CHECK ("email_attempts" BETWEEN 0 AND 5);

-- Une facture ne change plus (obligation légale) : seul le suivi de l'envoi par e-mail avance.
CREATE FUNCTION "payments"."invoices_frozen_fields"() RETURNS trigger
    LANGUAGE plpgsql AS $$
BEGIN
    IF NEW."email_attempts" < OLD."email_attempts"
        OR (OLD."email_sent_at" IS NOT NULL AND NEW."email_sent_at" IS DISTINCT FROM OLD."email_sent_at") THEN
        RAISE EXCEPTION 'suivi de l''envoi : il ne fait qu''avancer' USING ERRCODE = 'check_violation';
    END IF;
    IF NEW."id" IS DISTINCT FROM OLD."id"
        OR NEW."number" IS DISTINCT FROM OLD."number"
        OR NEW."kind" IS DISTINCT FROM OLD."kind"
        OR NEW."order_id" IS DISTINCT FROM OLD."order_id"
        OR NEW."order_reference" IS DISTINCT FROM OLD."order_reference"
        OR NEW."account_id" IS DISTINCT FROM OLD."account_id"
        OR NEW."credited_invoice_id" IS DISTINCT FROM OLD."credited_invoice_id"
        OR NEW."issued_at" IS DISTINCT FROM OLD."issued_at"
        OR NEW."subtotal" IS DISTINCT FROM OLD."subtotal"
        OR NEW."discount" IS DISTINCT FROM OLD."discount"
        OR NEW."delivery_fee" IS DISTINCT FROM OLD."delivery_fee"
        OR NEW."total" IS DISTINCT FROM OLD."total"
        OR NEW."vat_mention" IS DISTINCT FROM OLD."vat_mention"
        OR NEW."seller" IS DISTINCT FROM OLD."seller"
        OR NEW."buyer" IS DISTINCT FROM OLD."buyer"
        OR NEW."lines" IS DISTINCT FROM OLD."lines"
        OR NEW."payment_method" IS DISTINCT FROM OLD."payment_method"
        OR NEW."payment_reference" IS DISTINCT FROM OLD."payment_reference"
        OR NEW."created_at" IS DISTINCT FROM OLD."created_at" THEN
        RAISE EXCEPTION 'facture figée' USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER "invoices_frozen_fields"
    BEFORE UPDATE ON "payments"."invoices"
    FOR EACH ROW EXECUTE FUNCTION "payments"."invoices_frozen_fields"();

-- Un avoir annule une FACTURE de la même commande, du même montant.
CREATE FUNCTION "payments"."invoices_credit_matches"() RETURNS trigger
    LANGUAGE plpgsql AS $$
DECLARE
    credited RECORD;
BEGIN
    IF NEW."kind" = 'CREDIT_NOTE' THEN
        SELECT "kind", "order_id", "total" INTO credited
            FROM "payments"."invoices" WHERE "id" = NEW."credited_invoice_id";
        IF credited."kind" IS DISTINCT FROM 'INVOICE' OR credited."order_id" <> NEW."order_id"
            OR credited."total" <> NEW."total" THEN
            RAISE EXCEPTION 'avoir sans facture correspondante' USING ERRCODE = 'check_violation';
        END IF;
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER "invoices_credit_matches"
    BEFORE INSERT ON "payments"."invoices"
    FOR EACH ROW EXECUTE FUNCTION "payments"."invoices_credit_matches"();

-- Factures, avoirs, compteurs et informations de l'entreprise ne s'effacent jamais.
CREATE TRIGGER "invoices_no_delete"
    BEFORE DELETE ON "payments"."invoices"
    FOR EACH ROW EXECUTE FUNCTION "payments"."no_delete"();

CREATE TRIGGER "invoices_no_truncate"
    BEFORE TRUNCATE ON "payments"."invoices"
    FOR EACH STATEMENT EXECUTE FUNCTION "payments"."no_delete"();

CREATE TRIGGER "invoice_counters_no_delete"
    BEFORE DELETE ON "payments"."invoice_counters"
    FOR EACH ROW EXECUTE FUNCTION "payments"."no_delete"();

CREATE TRIGGER "invoice_counters_no_truncate"
    BEFORE TRUNCATE ON "payments"."invoice_counters"
    FOR EACH STATEMENT EXECUTE FUNCTION "payments"."no_delete"();

CREATE TRIGGER "billing_settings_no_delete"
    BEFORE DELETE ON "payments"."billing_settings"
    FOR EACH ROW EXECUTE FUNCTION "payments"."no_delete"();

CREATE TRIGGER "billing_settings_no_truncate"
    BEFORE TRUNCATE ON "payments"."billing_settings"
    FOR EACH STATEMENT EXECUTE FUNCTION "payments"."no_delete"();
