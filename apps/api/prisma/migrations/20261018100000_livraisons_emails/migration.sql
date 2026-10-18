-- E-mails de livraison au client (S7-T02, ADR-0041). Migration d'ajout : la version précédente de l'API ignore la
-- nouvelle table.

-- CreateEnum
CREATE TYPE "shipping"."shipment_email_kind" AS ENUM ('HANDED_OVER', 'DELIVERED');

-- CreateTable
CREATE TABLE "shipping"."shipment_emails" (
    "id" UUID NOT NULL,
    "shipment_id" UUID NOT NULL,
    "kind" "shipping"."shipment_email_kind" NOT NULL,
    "account_id" UUID NOT NULL,
    "order_reference" VARCHAR(10) NOT NULL,
    "attempts" SMALLINT NOT NULL DEFAULT 0,
    "next_at" TIMESTAMPTZ(3),
    "sent_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "shipment_emails_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "shipment_emails_shipment_id_kind_key" ON "shipping"."shipment_emails"("shipment_id", "kind");

-- CreateIndex
CREATE INDEX "shipment_emails_next_at_idx" ON "shipping"."shipment_emails"("next_at");

-- AddForeignKey
ALTER TABLE "shipping"."shipment_emails" ADD CONSTRAINT "shipment_emails_shipment_id_fkey" FOREIGN KEY ("shipment_id") REFERENCES "shipping"."shipments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ─── Règles que Prisma ne sait pas décrire (ajoutées à la main) ─────────────────────────────

-- 5 essais au plus ; envoyé = plus de prochain essai.
ALTER TABLE "shipping"."shipment_emails"
    ADD CONSTRAINT "shipment_emails_attempts_check" CHECK ("attempts" BETWEEN 0 AND 5),
    ADD CONSTRAINT "shipment_emails_sent_check" CHECK ("sent_at" IS NULL OR "next_at" IS NULL);

-- Jamais effacé (trace de ce qui a été envoyé au client).
CREATE OR REPLACE FUNCTION "shipping"."shipment_emails_no_delete"() RETURNS trigger
    LANGUAGE plpgsql AS $$
BEGIN
    RAISE EXCEPTION 'e-mail de livraison : jamais effacé' USING ERRCODE = 'check_violation';
END;
$$;

CREATE TRIGGER "shipment_emails_no_delete"
    BEFORE DELETE ON "shipping"."shipment_emails"
    FOR EACH ROW EXECUTE FUNCTION "shipping"."shipment_emails_no_delete"();
