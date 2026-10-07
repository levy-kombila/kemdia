-- Module identity (S4-T01, ADR-0015) : comptes, codes à usage unique, sessions.

-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "identity";

-- CreateEnum
CREATE TYPE "identity"."account_status" AS ENUM ('PENDING', 'ACTIVE', 'DISABLED');

-- CreateEnum
CREATE TYPE "identity"."otp_purpose" AS ENUM ('SIGNUP', 'RESET');

-- CreateEnum
CREATE TYPE "identity"."otp_channel" AS ENUM ('EMAIL', 'SMS');

-- CreateTable
CREATE TABLE "identity"."accounts" (
    "id" UUID NOT NULL,
    "first_name" VARCHAR(60) NOT NULL,
    "last_name" VARCHAR(60) NOT NULL,
    "email" VARCHAR(254),
    "phone" VARCHAR(13),
    "password_hash" VARCHAR(255) NOT NULL,
    "status" "identity"."account_status" NOT NULL DEFAULT 'PENDING',
    "email_verified_at" TIMESTAMPTZ(3),
    "phone_verified_at" TIMESTAMPTZ(3),
    "failed_logins" INTEGER NOT NULL DEFAULT 0,
    "locked_until" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "identity"."otp_challenges" (
    "id" UUID NOT NULL,
    "purpose" "identity"."otp_purpose" NOT NULL,
    "channel" "identity"."otp_channel" NOT NULL,
    "destination" VARCHAR(254) NOT NULL,
    "code_hash" CHAR(64) NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "consumed_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "otp_challenges_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "identity"."sessions" (
    "id" UUID NOT NULL,
    "account_id" UUID NOT NULL,
    "token_hash" CHAR(64) NOT NULL,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "last_seen_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revoked_at" TIMESTAMPTZ(3),
    "user_agent" VARCHAR(200),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "accounts_email_key" ON "identity"."accounts"("email");

-- CreateIndex
CREATE UNIQUE INDEX "accounts_phone_key" ON "identity"."accounts"("phone");

-- CreateIndex
CREATE INDEX "otp_challenges_destination_created_at_idx" ON "identity"."otp_challenges"("destination", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "sessions_token_hash_key" ON "identity"."sessions"("token_hash");

-- CreateIndex
CREATE INDEX "sessions_account_id_idx" ON "identity"."sessions"("account_id");

-- AddForeignKey
ALTER TABLE "identity"."sessions" ADD CONSTRAINT "sessions_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "identity"."accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Règles que Prisma ne sait pas décrire (ajoutées à la main, ignorées par `prisma migrate diff`)

-- Un compte a au moins un identifiant ; formes normalisées seulement (le domaine les produit déjà)
ALTER TABLE "identity"."accounts"
    ADD CONSTRAINT "accounts_identifier_check" CHECK ("email" IS NOT NULL OR "phone" IS NOT NULL),
    ADD CONSTRAINT "accounts_email_check" CHECK ("email" IS NULL OR ("email" = lower("email") AND "email" LIKE '%_@_%.%')),
    ADD CONSTRAINT "accounts_phone_check" CHECK ("phone" IS NULL OR "phone" ~ '^\+2410[67][0-9]{7}$'),
    ADD CONSTRAINT "accounts_failed_logins_check" CHECK ("failed_logins" >= 0),
    -- BR-041 : un compte actif a forcément un identifiant vérifié
    ADD CONSTRAINT "accounts_active_verified_check" CHECK (
        "status" <> 'ACTIVE' OR "email_verified_at" IS NOT NULL OR "phone_verified_at" IS NOT NULL
    );

ALTER TABLE "identity"."otp_challenges"
    ADD CONSTRAINT "otp_challenges_code_hash_check" CHECK ("code_hash" ~ '^[0-9a-f]{64}$'),
    ADD CONSTRAINT "otp_challenges_attempts_check" CHECK ("attempts" >= 0 AND "attempts" <= 5),
    ADD CONSTRAINT "otp_challenges_expires_at_check" CHECK ("expires_at" > "created_at");

ALTER TABLE "identity"."sessions"
    ADD CONSTRAINT "sessions_token_hash_check" CHECK ("token_hash" ~ '^[0-9a-f]{64}$'),
    ADD CONSTRAINT "sessions_expires_at_check" CHECK ("expires_at" > "created_at");
