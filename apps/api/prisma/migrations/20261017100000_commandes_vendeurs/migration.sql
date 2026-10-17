-- Commandes des vendeurs (S6-T07, ADR-0038 ; BR-013). Une commande est découpée en une part par boutique : chaque
-- vendeur accepte ou refuse la sienne dans les 24 h qui suivent la confirmation de la commande.
--
-- Migration d'ajout, compatible avec la version précédente de l'API pendant le déploiement : la colonne
-- `order_items.shop_id` est remplie par la base quand l'ancienne API ne la donne pas (déclencheur ci-dessous).

-- AlterEnum
ALTER TYPE "orders"."cancel_reason" ADD VALUE 'VENDOR_REFUSED';
ALTER TYPE "orders"."cancel_reason" ADD VALUE 'VENDOR_TIMEOUT';
ALTER TYPE "payments"."refund_reason" ADD VALUE 'VENDOR_CANCEL';

-- CreateEnum
CREATE TYPE "orders"."shop_part_status" AS ENUM ('PENDING', 'ACCEPTED', 'REFUSED', 'EXPIRED');

-- AlterTable : boutique figée sur chaque ligne de commande. Les lignes sont en ajout seul : le déclencheur qui l'impose
-- est suspendu le temps de remplir la nouvelle colonne, DANS la transaction de la migration.
ALTER TABLE "orders"."order_items" ADD COLUMN "shop_id" UUID;
ALTER TABLE "orders"."order_items" DISABLE TRIGGER "order_items_append_only";
UPDATE "orders"."order_items" AS i
SET "shop_id" = COALESCE(
    (SELECT p."shop_id" FROM "catalog"."products" AS p WHERE p."id" = i."product_id"),
    '6b656d64-6961-4000-8000-000000000001'::uuid
);
ALTER TABLE "orders"."order_items" ENABLE TRIGGER "order_items_append_only";
ALTER TABLE "orders"."order_items" ALTER COLUMN "shop_id" SET NOT NULL;

-- CreateTable
CREATE TABLE "orders"."order_shop_parts" (
    "order_id" UUID NOT NULL,
    "shop_id" UUID NOT NULL,
    "status" "orders"."shop_part_status" NOT NULL,
    "subtotal" INTEGER NOT NULL,
    "item_count" INTEGER NOT NULL,
    "opened_at" TIMESTAMPTZ(3),
    "due_at" TIMESTAMPTZ(3),
    "decided_at" TIMESTAMPTZ(3),
    "decided_by" UUID,
    "refusal_reason" VARCHAR(300),
    "email_attempts" INTEGER NOT NULL DEFAULT 0,
    "email_next_at" TIMESTAMPTZ(3),
    "email_sent_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "order_shop_parts_pkey" PRIMARY KEY ("order_id","shop_id")
);

-- CreateIndex
CREATE INDEX "order_shop_parts_shop_id_opened_at_order_id_idx" ON "orders"."order_shop_parts"("shop_id", "opened_at" DESC, "order_id" DESC);

-- CreateIndex
CREATE INDEX "order_shop_parts_status_due_at_idx" ON "orders"."order_shop_parts"("status", "due_at");

-- CreateIndex
CREATE INDEX "order_shop_parts_email_next_at_idx" ON "orders"."order_shop_parts"("email_next_at");

-- AddForeignKey
ALTER TABLE "orders"."order_shop_parts" ADD CONSTRAINT "order_shop_parts_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"."orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ─── Règles que Prisma ne sait pas décrire (ajoutées à la main) ─────────────────────────────

-- Ligne de commande insérée sans boutique (version précédente de l'API, le temps du déploiement) : celle du produit,
-- sinon la boutique Kemdia. Une ligne donnée avec sa boutique n'est jamais modifiée.
CREATE FUNCTION "orders"."order_items_shop"() RETURNS trigger
    LANGUAGE plpgsql AS $$
BEGIN
    IF NEW."shop_id" IS NULL THEN
        NEW."shop_id" := COALESCE(
            (SELECT "shop_id" FROM "catalog"."products" WHERE "id" = NEW."product_id"),
            '6b656d64-6961-4000-8000-000000000001'::uuid
        );
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER "order_items_shop"
    BEFORE INSERT ON "orders"."order_items"
    FOR EACH ROW EXECUTE FUNCTION "orders"."order_items_shop"();

-- Montants, part Kemdia, délai, décision et motif (mêmes valeurs que VENDOR_ORDER_REFUSAL_LIMITS du contrat)
ALTER TABLE "orders"."order_shop_parts"
    ADD CONSTRAINT "order_shop_parts_amounts_check" CHECK ("subtotal" > 0 AND "item_count" BETWEEN 1 AND 1000),
    -- Boutique Kemdia : acceptée d'office, jamais ouverte à un vendeur ni soumise à un délai
    ADD CONSTRAINT "order_shop_parts_kemdia_check" CHECK (
        "shop_id" <> '6b656d64-6961-4000-8000-000000000001'::uuid
        OR ("status" = 'ACCEPTED' AND "opened_at" IS NULL AND "due_at" IS NULL AND "decided_by" IS NULL)
    ),
    -- Ouverte ⇔ échéance, et l'échéance suit l'ouverture
    ADD CONSTRAINT "order_shop_parts_due_check" CHECK (
        ("opened_at" IS NULL) = ("due_at" IS NULL) AND ("due_at" IS NULL OR "due_at" > "opened_at")
    ),
    -- Décidée ⇔ date de décision ; un vendeur ne décide qu'une part ouverte
    ADD CONSTRAINT "order_shop_parts_decision_check" CHECK (
        ("status" = 'PENDING') = ("decided_at" IS NULL)
        AND ("shop_id" = '6b656d64-6961-4000-8000-000000000001'::uuid OR "status" = 'PENDING' OR "opened_at" IS NOT NULL)
        AND ("decided_by" IS NULL OR "status" IN ('ACCEPTED', 'REFUSED'))
    ),
    -- Refusée ⇔ motif, de 5 à 300 caractères (espaces retirés)
    ADD CONSTRAINT "order_shop_parts_refusal_check" CHECK (
        ("status" = 'REFUSED') = ("refusal_reason" IS NOT NULL)
        AND ("refusal_reason" IS NULL OR char_length(btrim("refusal_reason")) BETWEEN 5 AND 300)
    ),
    ADD CONSTRAINT "order_shop_parts_email_check" CHECK ("email_attempts" BETWEEN 0 AND 5);

-- Une part ne change que dans l'ordre prévu : commande, boutique, montants et date de création figés ; ouverte une seule
-- fois (le délai ne se déplace jamais) ; en attente → acceptée, refusée ou expirée, puis la décision ne change plus.
CREATE FUNCTION "orders"."order_shop_parts_rules"() RETURNS trigger
    LANGUAGE plpgsql AS $$
BEGIN
    IF NEW."order_id" IS DISTINCT FROM OLD."order_id"
        OR NEW."shop_id" IS DISTINCT FROM OLD."shop_id"
        OR NEW."subtotal" IS DISTINCT FROM OLD."subtotal"
        OR NEW."item_count" IS DISTINCT FROM OLD."item_count"
        OR NEW."created_at" IS DISTINCT FROM OLD."created_at" THEN
        RAISE EXCEPTION 'part de boutique figée' USING ERRCODE = 'check_violation';
    END IF;
    IF OLD."opened_at" IS NOT NULL AND (
        NEW."opened_at" IS DISTINCT FROM OLD."opened_at" OR NEW."due_at" IS DISTINCT FROM OLD."due_at") THEN
        RAISE EXCEPTION 'délai du vendeur figé' USING ERRCODE = 'check_violation';
    END IF;
    IF OLD."status" <> 'PENDING' AND (
        NEW."status" IS DISTINCT FROM OLD."status"
        OR NEW."decided_at" IS DISTINCT FROM OLD."decided_at"
        OR NEW."decided_by" IS DISTINCT FROM OLD."decided_by"
        OR NEW."refusal_reason" IS DISTINCT FROM OLD."refusal_reason") THEN
        RAISE EXCEPTION 'décision du vendeur figée' USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER "order_shop_parts_rules"
    BEFORE UPDATE ON "orders"."order_shop_parts"
    FOR EACH ROW EXECUTE FUNCTION "orders"."order_shop_parts_rules"();

-- Jamais supprimées (preuve de la décision du vendeur), comme les commandes
CREATE TRIGGER "order_shop_parts_no_delete"
    BEFORE DELETE ON "orders"."order_shop_parts"
    FOR EACH ROW EXECUTE FUNCTION "orders"."no_delete"();

CREATE TRIGGER "order_shop_parts_no_truncate"
    BEFORE TRUNCATE ON "orders"."order_shop_parts"
    FOR EACH STATEMENT EXECUTE FUNCTION "orders"."no_delete"();

-- ─── Commandes déjà passées ─────────────────────────────────────────────────────────────────

-- Une part par boutique de chaque commande existante :
--   - boutique Kemdia : acceptée d'office ;
--   - vendeur, commande confirmée : à traiter, avec 24 h à partir de maintenant, et l'e-mail au vendeur ;
--   - vendeur, commande déjà en préparation ou plus loin (n'existe pas encore) : acceptée ;
--   - vendeur, commande annulée après sa confirmation : visible du vendeur (annulée), sans e-mail ;
--   - vendeur, commande en attente de paiement ou annulée avant d'être payée : invisible du vendeur.
WITH parts AS (
    SELECT i."order_id", i."shop_id", sum(i."line_total")::int AS "subtotal", sum(i."quantity")::int AS "item_count"
    FROM "orders"."order_items" AS i
    GROUP BY i."order_id", i."shop_id"
),
confirmed AS (
    SELECT h."order_id", min(h."at") AS "at"
    FROM "orders"."order_status_history" AS h
    WHERE h."status" = 'CONFIRMED'
    GROUP BY h."order_id"
),
plan AS (
    SELECT p.*, o."status" AS "order_status", o."created_at" AS "order_created_at",
        p."shop_id" = '6b656d64-6961-4000-8000-000000000001'::uuid AS "kemdia",
        CASE
            WHEN o."status" = 'CONFIRMED' THEN now()
            WHEN o."status" IN ('PREPARING', 'SHIPPED', 'DELIVERED') THEN COALESCE(c."at", o."created_at")
            WHEN o."status" = 'CANCELLED' THEN c."at"
        END AS "opened_at"
    FROM parts AS p
    JOIN "orders"."orders" AS o ON o."id" = p."order_id"
    LEFT JOIN confirmed AS c ON c."order_id" = p."order_id"
)
INSERT INTO "orders"."order_shop_parts"
    ("order_id", "shop_id", "status", "subtotal", "item_count", "opened_at", "due_at", "decided_at", "email_next_at",
     "created_at")
SELECT
    "order_id",
    "shop_id",
    (CASE WHEN "kemdia" OR "order_status" IN ('PREPARING', 'SHIPPED', 'DELIVERED') THEN 'ACCEPTED' ELSE 'PENDING' END)
        ::"orders"."shop_part_status",
    "subtotal",
    "item_count",
    CASE WHEN "kemdia" THEN NULL ELSE "opened_at" END,
    CASE WHEN "kemdia" OR "opened_at" IS NULL THEN NULL ELSE "opened_at" + interval '24 hours' END,
    CASE WHEN "kemdia" THEN "order_created_at" WHEN "order_status" IN ('PREPARING', 'SHIPPED', 'DELIVERED') THEN now() END,
    CASE WHEN NOT "kemdia" AND "order_status" = 'CONFIRMED' THEN now() END,
    "order_created_at"
FROM plan;
