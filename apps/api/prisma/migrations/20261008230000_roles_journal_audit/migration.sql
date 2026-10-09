-- Rôles des comptes et journal d'audit (S4-T06, ADR-0020).

-- ─── Rôles (schéma identity) ──────────────────────────────────────────────────────────────

-- CreateEnum
CREATE TYPE "identity"."role" AS ENUM ('VENDOR', 'MODERATOR', 'ADMIN');

-- CreateTable
CREATE TABLE "identity"."account_roles" (
    "account_id" UUID NOT NULL,
    "role" "identity"."role" NOT NULL,
    "granted_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "granted_by" UUID,

    CONSTRAINT "account_roles_pkey" PRIMARY KEY ("account_id","role")
);

-- CreateIndex
CREATE INDEX "account_roles_role_idx" ON "identity"."account_roles"("role");

-- AddForeignKey
ALTER TABLE "identity"."account_roles" ADD CONSTRAINT "account_roles_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "identity"."accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Règles que Prisma ne sait pas décrire (ajoutées à la main)
-- CRIT-06 : personne ne s'accorde un rôle à soi-même (la commande serveur laisse granted_by vide).
ALTER TABLE "identity"."account_roles"
    ADD CONSTRAINT "account_roles_granted_by_check" CHECK ("granted_by" IS NULL OR "granted_by" <> "account_id");

-- ─── Journal d'audit (schéma audit) ───────────────────────────────────────────────────────

-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "audit";

-- CreateEnum
CREATE TYPE "audit"."actor_type" AS ENUM ('ACCOUNT', 'SYSTEM');

-- CreateTable
CREATE TABLE "audit"."events" (
    "id" UUID NOT NULL,
    "occurred_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "action" VARCHAR(64) NOT NULL,
    "actor_type" "audit"."actor_type" NOT NULL,
    "actor_id" UUID,
    "target_type" VARCHAR(32),
    "target_id" UUID,
    "details" JSONB NOT NULL DEFAULT '{}',
    "ip" INET,
    "request_id" VARCHAR(64),

    CONSTRAINT "events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "events_occurred_at_idx" ON "audit"."events"("occurred_at");

-- CreateIndex
CREATE INDEX "events_actor_id_occurred_at_idx" ON "audit"."events"("actor_id", "occurred_at");

-- CreateIndex
CREATE INDEX "events_target_id_occurred_at_idx" ON "audit"."events"("target_id", "occurred_at");

-- Règles que Prisma ne sait pas décrire (ajoutées à la main)
ALTER TABLE "audit"."events"
    ADD CONSTRAINT "events_action_check" CHECK ("action" ~ '^[a-z]+(\.[a-z_]+)+$'),
    -- Un compte agit sous son UUID ; le serveur (SYSTEM) n'en a pas
    ADD CONSTRAINT "events_actor_check" CHECK (("actor_type" = 'ACCOUNT') = ("actor_id" IS NOT NULL)),
    ADD CONSTRAINT "events_target_check" CHECK (("target_type" IS NULL) = ("target_id" IS NULL)),
    ADD CONSTRAINT "events_target_type_check" CHECK ("target_type" IS NULL OR "target_type" ~ '^[a-z_]{1,32}$'),
    -- Petit objet de précisions, jamais un document entier
    ADD CONSTRAINT "events_details_check" CHECK (jsonb_typeof("details") = 'object' AND pg_column_size("details") <= 2048);

-- Table en AJOUT SEUL : une ligne écrite ne change plus. Seule la purge des lignes de plus de 365 jours
-- est permise (durée de conservation, ADR-0020). Protège contre une erreur ou une injection dans l'API ;
-- le propriétaire de la table peut toujours désactiver le déclencheur (rôles PostgreSQL séparés au S7).
CREATE FUNCTION "audit"."events_append_only"() RETURNS trigger
    LANGUAGE plpgsql AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN
        IF OLD."occurred_at" < CURRENT_TIMESTAMP - INTERVAL '365 days' THEN
            RETURN OLD;
        END IF;
    END IF;
    RAISE EXCEPTION 'journal d''audit : % interdit (ajout seul, purge après 365 jours)', TG_OP
        USING ERRCODE = 'insufficient_privilege';
END;
$$;

-- La date est celle de la BASE, jamais celle envoyée par l'API : une ligne ne peut pas être antidatée
-- pour devenir supprimable.
CREATE FUNCTION "audit"."events_stamp"() RETURNS trigger
    LANGUAGE plpgsql AS $$
BEGIN
    NEW."occurred_at" := CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$;

CREATE TRIGGER "events_stamp"
    BEFORE INSERT ON "audit"."events"
    FOR EACH ROW EXECUTE FUNCTION "audit"."events_stamp"();

CREATE TRIGGER "events_no_update"
    BEFORE UPDATE ON "audit"."events"
    FOR EACH ROW EXECUTE FUNCTION "audit"."events_append_only"();

CREATE TRIGGER "events_delete_after_retention"
    BEFORE DELETE ON "audit"."events"
    FOR EACH ROW EXECUTE FUNCTION "audit"."events_append_only"();

CREATE TRIGGER "events_no_truncate"
    BEFORE TRUNCATE ON "audit"."events"
    FOR EACH STATEMENT EXECUTE FUNCTION "audit"."events_append_only"();
