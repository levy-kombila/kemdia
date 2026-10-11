-- Notifications signées de l'opérateur Mobile Money (S5-T05, ADR-0027) : une notification n'est traitée qu'une fois.
-- Migration d'ajout seulement.

-- CreateTable
CREATE TABLE "payments"."provider_events" (
    "id" UUID NOT NULL,
    "payment_id" UUID NOT NULL,
    "type" VARCHAR(30) NOT NULL,
    "received_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "provider_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "provider_events_payment_id_idx" ON "payments"."provider_events"("payment_id");

-- ─── Règles que Prisma ne sait pas décrire (ajoutées à la main) ─────────────────────────────

ALTER TABLE "payments"."provider_events"
    ADD CONSTRAINT "provider_events_type_check" CHECK ("type" IN ('payment.succeeded', 'payment.failed'));

-- Trace des notifications reçues : en ajout seul (ni modification, ni suppression, ni TRUNCATE).
CREATE FUNCTION "payments"."append_only"() RETURNS trigger
    LANGUAGE plpgsql AS $$
BEGIN
    RAISE EXCEPTION 'table en ajout seul : %', TG_TABLE_NAME USING ERRCODE = 'insufficient_privilege';
END;
$$;

CREATE TRIGGER "provider_events_append_only"
    BEFORE UPDATE OR DELETE ON "payments"."provider_events"
    FOR EACH ROW EXECUTE FUNCTION "payments"."append_only"();

CREATE TRIGGER "provider_events_no_truncate"
    BEFORE TRUNCATE ON "payments"."provider_events"
    FOR EACH STATEMENT EXECUTE FUNCTION "payments"."append_only"();
