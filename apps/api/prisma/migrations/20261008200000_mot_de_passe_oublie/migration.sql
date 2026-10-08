-- Mot de passe oublié (S4-T04, ADR-0018).

-- CreateTable
CREATE TABLE "identity"."reset_tickets" (
    "id" UUID NOT NULL,
    "ticket_hash" CHAR(64) NOT NULL,
    "destination" VARCHAR(254) NOT NULL,
    "account_id" UUID,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "reset_tickets_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "reset_tickets_ticket_hash_key" ON "identity"."reset_tickets"("ticket_hash");

-- CreateIndex
CREATE INDEX "reset_tickets_destination_idx" ON "identity"."reset_tickets"("destination");

-- CreateIndex
CREATE INDEX "reset_tickets_account_id_idx" ON "identity"."reset_tickets"("account_id");

-- AddForeignKey
ALTER TABLE "identity"."reset_tickets" ADD CONSTRAINT "reset_tickets_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "identity"."accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Règles que Prisma ne sait pas décrire (ajoutées à la main)
ALTER TABLE "identity"."reset_tickets"
    ADD CONSTRAINT "reset_tickets_ticket_hash_check" CHECK ("ticket_hash" ~ '^[0-9a-f]{64}$'),
    ADD CONSTRAINT "reset_tickets_expires_at_check" CHECK ("expires_at" > "created_at");

-- Version du mot de passe (ADR-0018) : +1 à chaque changement ; une session ouverte avec une
-- autre version est refusée (même une connexion commencée juste avant le changement).
ALTER TABLE "identity"."accounts"
  ADD COLUMN "password_version" INTEGER NOT NULL DEFAULT 0,
  ADD CONSTRAINT "accounts_password_version_check" CHECK ("password_version" >= 0);

ALTER TABLE "identity"."sessions"
  ADD COLUMN "password_version" INTEGER NOT NULL DEFAULT 0,
  ADD CONSTRAINT "sessions_password_version_check" CHECK ("password_version" >= 0);
