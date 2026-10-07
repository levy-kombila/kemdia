-- Tickets d'inscription (S4-T02, ADR-0016).

-- CreateTable
CREATE TABLE "identity"."signup_tickets" (
    "id" UUID NOT NULL,
    "ticket_hash" CHAR(64) NOT NULL,
    "destination" VARCHAR(254) NOT NULL,
    "first_name" VARCHAR(60),
    "last_name" VARCHAR(60),
    "password_hash" VARCHAR(255),
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "signup_tickets_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "signup_tickets_ticket_hash_key" ON "identity"."signup_tickets"("ticket_hash");

-- CreateIndex
CREATE INDEX "signup_tickets_destination_idx" ON "identity"."signup_tickets"("destination");

-- Règles que Prisma ne sait pas décrire (ajoutées à la main)
ALTER TABLE "identity"."signup_tickets"
    ADD CONSTRAINT "signup_tickets_ticket_hash_check" CHECK ("ticket_hash" ~ '^[0-9a-f]{64}$'),
    ADD CONSTRAINT "signup_tickets_expires_at_check" CHECK ("expires_at" > "created_at"),
    -- Inscription complète (prénom, nom, mot de passe) ou ticket leurre (rien)
    ADD CONSTRAINT "signup_tickets_registration_check" CHECK (
        ("first_name" IS NULL AND "last_name" IS NULL AND "password_hash" IS NULL)
        OR ("first_name" IS NOT NULL AND "last_name" IS NOT NULL AND "password_hash" IS NOT NULL)
    );

-- Les comptes ne sont plus créés « en attente » : ils naissent vérifiés, à la validation du code (ADR-0016).
-- Aucune route ne créait de compte avant cette version : cette ligne ne supprime normalement rien.
DELETE FROM "identity"."accounts" WHERE "status" = 'PENDING';
