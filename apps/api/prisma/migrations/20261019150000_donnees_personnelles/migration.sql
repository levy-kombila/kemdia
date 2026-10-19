-- S7-T08 (ADR-0047) : données personnelles — preuve du consentement, activité, effacement d'un compte.
-- Migration d'AJOUT (règle du projet) : colonnes nouvelles et contraintes ÉLARGIES seulement pour les lignes
-- anonymisées ; une ligne ordinaire obéit exactement aux mêmes règles qu'avant.

-- --- identity : compte ---------------------------------------------------------------------------------------------
ALTER TABLE "identity"."accounts"
    -- Preuve du consentement (loi 001/2011 modifiée, art. 72) : conditions acceptées, 18 ans ou plus (art. 74)
    ADD COLUMN "terms_accepted_at"   TIMESTAMPTZ(3),
    ADD COLUMN "adult_confirmed_at"  TIMESTAMPTZ(3),
    -- Dernière activité (connexion, visite) : les comptes inactifs depuis 3 ans sont effacés (art. 70)
    ADD COLUMN "last_active_at"      TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    ADD COLUMN "inactivity_notice_at" TIMESTAMPTZ(3),
    -- Compte effacé : identité remplacée, plus aucun e-mail ni téléphone
    ADD COLUMN "deleted_at"          TIMESTAMPTZ(3);

-- Comptes existants : actifs à la date de leur dernière modification connue (jamais plus tôt que leur création)
UPDATE "identity"."accounts" SET "last_active_at" = GREATEST("created_at", "updated_at");

ALTER TABLE "identity"."accounts"
    DROP CONSTRAINT "accounts_identifier_check",
    ADD CONSTRAINT "accounts_identifier_check" CHECK (
        "email" IS NOT NULL OR "phone" IS NOT NULL OR "deleted_at" IS NOT NULL
    ),
    -- Un compte effacé n'a plus ni e-mail ni téléphone, et ne peut plus être actif
    ADD CONSTRAINT "accounts_deleted_check" CHECK (
        "deleted_at" IS NULL OR ("email" IS NULL AND "phone" IS NULL AND "status" = 'DISABLED')
    );

CREATE INDEX "accounts_last_active_at_idx" ON "identity"."accounts" ("last_active_at") WHERE "deleted_at" IS NULL;

-- --- orders : commande d'un compte effacé ---------------------------------------------------------------------------
ALTER TABLE "orders"."orders"
    ADD COLUMN "anonymized_at" TIMESTAMPTZ(3),
    ALTER COLUMN "delivery_phone" DROP NOT NULL;

ALTER TABLE "orders"."orders"
    DROP CONSTRAINT "orders_delivery_phone_check",
    ADD CONSTRAINT "orders_delivery_phone_check" CHECK (
        ("anonymized_at" IS NULL AND "delivery_phone" ~ '^\+2410[67][0-9]{7}$')
        OR ("anonymized_at" IS NOT NULL AND "delivery_phone" IS NULL)
    ),
    DROP CONSTRAINT "orders_payment_phone_check",
    ADD CONSTRAINT "orders_payment_phone_check" CHECK (
        ("payment_method" = 'COD' AND "payment_phone" IS NULL)
        OR ("payment_method" <> 'COD' AND "payment_phone" ~ '^\+2410[67][0-9]{7}$')
        OR ("payment_method" <> 'COD' AND "payment_phone" IS NULL AND "anonymized_at" IS NOT NULL)
    );

-- --- payments : paiements et remboursements d'un compte effacé ------------------------------------------------------
ALTER TABLE "payments"."payments" ADD COLUMN "anonymized_at" TIMESTAMPTZ(3);
ALTER TABLE "payments"."payments"
    DROP CONSTRAINT "payments_channel_check",
    ADD CONSTRAINT "payments_channel_check" CHECK (
        ("method" = 'COD' AND "phone" IS NULL AND "attempt" = 1 AND "status" = 'SUCCEEDED'
            AND "collected_by" IS NOT NULL AND "provider_ref" IS NULL)
        OR ("method" <> 'COD' AND "phone" ~ '^\+2410[67][0-9]{7}$' AND "collected_by" IS NULL)
        OR ("method" <> 'COD' AND "phone" IS NULL AND "anonymized_at" IS NOT NULL AND "collected_by" IS NULL)
    );

ALTER TABLE "payments"."refunds"
    ADD COLUMN "anonymized_at" TIMESTAMPTZ(3),
    ALTER COLUMN "phone" DROP NOT NULL;
ALTER TABLE "payments"."refunds"
    DROP CONSTRAINT "refunds_channel_check",
    ADD CONSTRAINT "refunds_channel_check" CHECK (
        "method" <> 'COD' AND (
            "phone" ~ '^\+2410[67][0-9]{7}$'
            -- Seul un remboursement FAIT peut perdre son numéro (un remboursement à faire bloque l'effacement)
            OR ("phone" IS NULL AND "anonymized_at" IS NOT NULL AND "status" = 'DONE')
        )
    );

-- --- Règles « figées » : l'anonymisation est la SEULE exception -----------------------------------------------------
-- Une commande, un paiement, un remboursement fait ou un historique d'expédition ne changent plus (preuve). Seul
-- passage permis : l'anonymisation, une fois, qui efface les coordonnées et RIEN d'autre (comparaison de la ligne
-- entière, sans les colonnes effacées ni la date de mise à jour). Une fois anonymisée, la ligne est de nouveau figée.

CREATE OR REPLACE FUNCTION "orders"."orders_frozen_fields"() RETURNS trigger
    LANGUAGE plpgsql AS $$
BEGIN
    IF OLD."anonymized_at" IS NULL AND NEW."anonymized_at" IS NOT NULL THEN
        -- Seulement une commande terminée (livrée ou annulée) : une commande en cours garde de quoi être livrée
        IF OLD."status" NOT IN ('DELIVERED', 'CANCELLED')
            OR NEW."delivery_name" <> '' OR NEW."delivery_phone" IS NOT NULL OR NEW."payment_phone" IS NOT NULL
            OR NEW."delivery_neighborhood" <> '' OR NEW."delivery_landmark" <> ''
            OR to_jsonb(NEW) - ARRAY['anonymized_at', 'updated_at', 'delivery_name', 'delivery_phone', 'payment_phone',
                    'delivery_neighborhood', 'delivery_landmark']
               IS DISTINCT FROM
               to_jsonb(OLD) - ARRAY['anonymized_at', 'updated_at', 'delivery_name', 'delivery_phone', 'payment_phone',
                    'delivery_neighborhood', 'delivery_landmark'] THEN
            RAISE EXCEPTION 'anonymisation : coordonnées effacées, rien d''autre' USING ERRCODE = 'check_violation';
        END IF;
        RETURN NEW;
    END IF;
    IF NEW."anonymized_at" IS DISTINCT FROM OLD."anonymized_at" THEN
        RAISE EXCEPTION 'anonymisation définitive' USING ERRCODE = 'check_violation';
    END IF;
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

CREATE OR REPLACE FUNCTION "payments"."payments_frozen_fields"() RETURNS trigger
    LANGUAGE plpgsql AS $$
BEGIN
    IF OLD."anonymized_at" IS NULL AND NEW."anonymized_at" IS NOT NULL THEN
        -- Jamais un essai en attente (la réponse de l'opérateur peut encore arriver)
        IF OLD."status" = 'PENDING' OR NEW."phone" IS NOT NULL OR NEW."method" = 'COD'
            OR to_jsonb(NEW) - ARRAY['anonymized_at', 'updated_at', 'phone'] IS DISTINCT FROM to_jsonb(OLD) - ARRAY['anonymized_at', 'updated_at', 'phone'] THEN
            RAISE EXCEPTION 'anonymisation : numéro effacé, rien d''autre' USING ERRCODE = 'check_violation';
        END IF;
        RETURN NEW;
    END IF;
    IF NEW."anonymized_at" IS DISTINCT FROM OLD."anonymized_at" THEN
        RAISE EXCEPTION 'anonymisation définitive' USING ERRCODE = 'check_violation';
    END IF;
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

CREATE OR REPLACE FUNCTION "payments"."refunds_frozen_fields"() RETURNS trigger
    LANGUAGE plpgsql AS $$
BEGIN
    -- Seul un remboursement FAIT s'anonymise (un remboursement à faire empêche l'effacement du compte)
    IF OLD."anonymized_at" IS NULL AND NEW."anonymized_at" IS NOT NULL THEN
        IF OLD."status" <> 'DONE' OR NEW."phone" IS NOT NULL
            OR to_jsonb(NEW) - ARRAY['anonymized_at', 'updated_at', 'phone'] IS DISTINCT FROM to_jsonb(OLD) - ARRAY['anonymized_at', 'updated_at', 'phone'] THEN
            RAISE EXCEPTION 'anonymisation : numéro effacé, rien d''autre' USING ERRCODE = 'check_violation';
        END IF;
        RETURN NEW;
    END IF;
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
        OR NEW."anonymized_at" IS DISTINCT FROM OLD."anonymized_at"
        OR NEW."created_at" IS DISTINCT FROM OLD."created_at" THEN
        RAISE EXCEPTION 'remboursement figé : seul son suivi change' USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
END;
$$;

-- Historique d'expédition : ajout seul, sauf la note libre de l'équipe, qui peut être EFFACÉE (elle peut nommer le
-- client) ; le statut et la date restent.
CREATE OR REPLACE FUNCTION "shipping"."shipment_events_append_only"() RETURNS trigger
    LANGUAGE plpgsql AS $$
BEGIN
    IF TG_OP = 'UPDATE' AND OLD."note" IS NOT NULL AND NEW."note" IS NULL
        AND to_jsonb(NEW) - 'note' = to_jsonb(OLD) - 'note' THEN
        RETURN NEW;
    END IF;
    RAISE EXCEPTION 'historique d''expédition : ajout seul' USING ERRCODE = 'check_violation';
END;
$$;
