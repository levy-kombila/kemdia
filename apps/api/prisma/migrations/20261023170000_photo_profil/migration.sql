-- S7.5-T08 (ADR-0055) : photo de profil, visible seulement par le titulaire du compte.

-- Version de la photo (16 premiers caractères de son empreinte) : l'adresse de la photo change avec elle
ALTER TABLE "identity"."accounts" ADD COLUMN "avatar_version" CHAR(16);
ALTER TABLE "identity"."accounts" ADD CONSTRAINT "accounts_avatar_version_check" CHECK (
    "avatar_version" IS NULL OR "avatar_version" ~ '^[0-9a-f]{16}$'
);

-- La photo elle-même : carré de 256 px en WebP, réencodé sans métadonnées par l'API (jamais le fichier reçu)
CREATE TABLE "identity"."account_avatars" (
    "account_id" UUID NOT NULL,
    "image" BYTEA NOT NULL,
    "sha256" CHAR(64) NOT NULL,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "account_avatars_pkey" PRIMARY KEY ("account_id"),
    CONSTRAINT "account_avatars_image_check" CHECK (octet_length("image") BETWEEN 12 AND 262144),
    CONSTRAINT "account_avatars_sha256_check" CHECK ("sha256" ~ '^[0-9a-f]{64}$')
);
ALTER TABLE "identity"."account_avatars" ADD CONSTRAINT "account_avatars_account_id_fkey"
    FOREIGN KEY ("account_id") REFERENCES "identity"."accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
