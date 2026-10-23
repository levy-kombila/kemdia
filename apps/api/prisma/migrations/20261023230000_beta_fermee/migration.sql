-- S8-T02 (ADR-0057) : bêta fermée (inscription sur invitation) et « Signaler un problème ».

-- 1. Réglage de la bêta : une seule ligne ; ouverte au départ (rien ne change au déploiement)
CREATE TABLE "identity"."beta_settings" (
    "id" SMALLINT NOT NULL,
    "closed" BOOLEAN NOT NULL DEFAULT false,
    "updated_by" UUID,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "beta_settings_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "beta_settings_single_row_check" CHECK ("id" = 1)
);
INSERT INTO "identity"."beta_settings" ("id", "closed", "updated_by", "updated_at")
VALUES (1, false, NULL, CURRENT_TIMESTAMP);

-- 2. Invitations : une ligne par adresse ; utilisée par le compte créé avec cette adresse
CREATE TYPE "identity"."beta_invitation_kind" AS ENUM ('PARTNER_VENDOR', 'TESTER');

CREATE TABLE "identity"."beta_invitations" (
    "id" UUID NOT NULL,
    "identifier" VARCHAR(254) NOT NULL,
    "kind" "identity"."beta_invitation_kind" NOT NULL,
    "invited_by" UUID,
    "used_by" UUID,
    "used_at" TIMESTAMPTZ(3),
    "revoked_at" TIMESTAMPTZ(3),
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "beta_invitations_pkey" PRIMARY KEY ("id"),
    -- La base double les règles du domaine : utilisée ⇔ compte connu ; jamais utilisée ET annulée
    CONSTRAINT "beta_invitations_used_check" CHECK (("used_at" IS NULL) = ("used_by" IS NULL)),
    CONSTRAINT "beta_invitations_state_check" CHECK ("used_at" IS NULL OR "revoked_at" IS NULL),
    CONSTRAINT "beta_invitations_expiry_check" CHECK ("expires_at" > "created_at"),
    CONSTRAINT "beta_invitations_identifier_check" CHECK (
        char_length("identifier") BETWEEN 3 AND 254 AND "identifier" = lower(btrim("identifier"))
    )
);

CREATE UNIQUE INDEX "beta_invitations_identifier_key" ON "identity"."beta_invitations" ("identifier");
CREATE INDEX "beta_invitations_created_at_id_idx"
    ON "identity"."beta_invitations" ("created_at" DESC, "id" DESC);
CREATE INDEX "beta_invitations_used_by_idx" ON "identity"."beta_invitations" ("used_by");
CREATE INDEX "beta_invitations_invited_by_idx" ON "identity"."beta_invitations" ("invited_by");

ALTER TABLE "identity"."beta_invitations"
    ADD CONSTRAINT "beta_invitations_invited_by_fkey" FOREIGN KEY ("invited_by")
        REFERENCES "identity"."accounts" ("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "identity"."beta_invitations"
    ADD CONSTRAINT "beta_invitations_used_by_fkey" FOREIGN KEY ("used_by")
        REFERENCES "identity"."accounts" ("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- 3. Signalements (module feedback)
CREATE SCHEMA IF NOT EXISTS "feedback";

CREATE TYPE "feedback"."problem_category" AS ENUM ('BUG', 'DISPLAY', 'PAYMENT', 'DELIVERY', 'OTHER');
CREATE TYPE "feedback"."problem_status" AS ENUM ('NEW', 'IN_PROGRESS', 'RESOLVED');

CREATE TABLE "feedback"."problem_reports" (
    "id" UUID NOT NULL,
    "account_id" UUID NOT NULL,
    "category" "feedback"."problem_category" NOT NULL,
    "message" VARCHAR(2000) NOT NULL,
    "page" VARCHAR(200),
    "device" VARCHAR(120),
    "status" "feedback"."problem_status" NOT NULL,
    "handled_by" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "problem_reports_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "problem_reports_message_check" CHECK (
        char_length("message") BETWEEN 10 AND 2000 AND "message" = btrim("message")
    ),
    -- Un chemin du site, jamais une adresse complète (ni « //autre-site »), ni des paramètres
    CONSTRAINT "problem_reports_page_check" CHECK (
        "page" IS NULL OR ("page" ~ '^/[^?#[:space:][:cntrl:]\\]{0,199}$' AND "page" NOT LIKE '//%')
    )
);

CREATE INDEX "problem_reports_status_created_at_id_idx"
    ON "feedback"."problem_reports" ("status", "created_at", "id");
CREATE INDEX "problem_reports_account_id_status_idx" ON "feedback"."problem_reports" ("account_id", "status");
