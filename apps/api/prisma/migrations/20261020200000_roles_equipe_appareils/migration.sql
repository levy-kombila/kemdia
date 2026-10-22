-- S7.5-T04 (ADR-0051) : rôles détaillés de l'équipe, appareils connus.

-- 1. Rôles : les modérateurs deviennent « Catalogue » (mêmes droits) ; trois rôles s'ajoutent.
--    RENAME garde les lignes existantes : aucun modérateur ne perd son accès.
ALTER TYPE "identity"."role" RENAME VALUE 'MODERATOR' TO 'CATALOG';
ALTER TYPE "identity"."role" ADD VALUE 'LOGISTICS';
ALTER TYPE "identity"."role" ADD VALUE 'FINANCE';
ALTER TYPE "identity"."role" ADD VALUE 'SUPPORT';

-- 2. Appareils déjà utilisés pour se connecter (empreintes seulement)
CREATE TABLE "identity"."known_devices" (
    "id" UUID NOT NULL,
    "account_id" UUID NOT NULL,
    "device_hash" CHAR(64) NOT NULL,
    "user_agent" VARCHAR(200),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_seen_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "alert_token_hash" CHAR(64),
    "alert_expires_at" TIMESTAMPTZ(3),

    CONSTRAINT "known_devices_pkey" PRIMARY KEY ("id"),
    -- Empreintes SHA-256 en hexadécimal ; jeton d'avis et échéance vont ensemble
    CONSTRAINT "known_devices_hash_check" CHECK ("device_hash" ~ '^[0-9a-f]{64}$'),
    CONSTRAINT "known_devices_alert_check" CHECK (
        ("alert_token_hash" IS NULL) = ("alert_expires_at" IS NULL)
        AND ("alert_token_hash" IS NULL OR "alert_token_hash" ~ '^[0-9a-f]{64}$')
    )
);

CREATE UNIQUE INDEX "known_devices_alert_token_hash_key" ON "identity"."known_devices"("alert_token_hash");
CREATE UNIQUE INDEX "known_devices_account_id_device_hash_key" ON "identity"."known_devices"("account_id", "device_hash");

ALTER TABLE "identity"."known_devices" ADD CONSTRAINT "known_devices_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "identity"."accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
