-- Double authentification de l'équipe (S6-T03, ADR-0034, MED-15). Migration d'ajout : la version précédente de l'API
-- continue de fonctionner (nouvelle colonne "second_factor_at" vide ; nouvelles tables ignorées par elle).

-- AlterTable
ALTER TABLE "identity"."sessions" ADD COLUMN     "second_factor_at" TIMESTAMPTZ(3);

-- CreateTable
CREATE TABLE "identity"."second_factors" (
    "account_id" UUID NOT NULL,
    "secret_box" BYTEA NOT NULL,
    "enabled_at" TIMESTAMPTZ(3),
    "last_used_step" BIGINT,
    "failed_count" INTEGER NOT NULL DEFAULT 0,
    "failed_since" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "second_factors_pkey" PRIMARY KEY ("account_id")
);

-- CreateTable
CREATE TABLE "identity"."recovery_codes" (
    "id" UUID NOT NULL,
    "account_id" UUID NOT NULL,
    "code_hash" CHAR(64) NOT NULL,
    "used_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "recovery_codes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "recovery_codes_code_hash_key" ON "identity"."recovery_codes"("code_hash");

-- CreateIndex
CREATE INDEX "recovery_codes_account_id_idx" ON "identity"."recovery_codes"("account_id");

-- AddForeignKey
ALTER TABLE "identity"."second_factors" ADD CONSTRAINT "second_factors_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "identity"."accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "identity"."recovery_codes" ADD CONSTRAINT "recovery_codes_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "identity"."accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ─── Règles que Prisma ne sait pas décrire (ajoutées à la main) ─────────────────────────────

-- Secret chiffré : version de clé (1 octet) + vecteur d'initialisation (12) + étiquette (16) + secret de 20 octets.
-- Une période utilisée n'existe qu'une fois la 2FA activée, et ne recule jamais (pas de rejeu d'un ancien code).
ALTER TABLE "identity"."second_factors"
    ADD CONSTRAINT "second_factors_secret_box_check" CHECK (octet_length("secret_box") = 49 AND get_byte("secret_box", 0) = 1),
    ADD CONSTRAINT "second_factors_step_check" CHECK ("last_used_step" IS NULL OR ("enabled_at" IS NOT NULL AND "last_used_step" > 0)),
    -- Échecs comptés sur 24 heures (relecture de sécurité S6-T03) : jamais remis à zéro par une réussite
    ADD CONSTRAINT "second_factors_failed_check" CHECK ("failed_count" >= 0 AND ("failed_count" = 0) = ("failed_since" IS NULL));

CREATE FUNCTION "identity"."second_factors_step_forward"() RETURNS trigger
    LANGUAGE plpgsql AS $$
BEGIN
    IF OLD."last_used_step" IS NOT NULL AND NEW."secret_box" = OLD."secret_box"
       AND (NEW."last_used_step" IS NULL OR NEW."last_used_step" < OLD."last_used_step") THEN
        RAISE EXCEPTION 'la dernière période utilisée ne recule jamais (S6-T03)' USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER "second_factors_step_forward"
    BEFORE UPDATE ON "identity"."second_factors"
    FOR EACH ROW EXECUTE FUNCTION "identity"."second_factors_step_forward"();

-- Code de secours : empreinte SHA-256 en hexadécimal ; une fois utilisé, il le reste.
ALTER TABLE "identity"."recovery_codes"
    ADD CONSTRAINT "recovery_codes_code_hash_check" CHECK ("code_hash" ~ '^[0-9a-f]{64}$');

CREATE FUNCTION "identity"."recovery_codes_used_once"() RETURNS trigger
    LANGUAGE plpgsql AS $$
BEGIN
    IF OLD."used_at" IS NOT NULL OR NEW."code_hash" <> OLD."code_hash" OR NEW."account_id" <> OLD."account_id" THEN
        RAISE EXCEPTION 'un code de secours utilisé ne change plus (S6-T03)' USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER "recovery_codes_used_once"
    BEFORE UPDATE ON "identity"."recovery_codes"
    FOR EACH ROW EXECUTE FUNCTION "identity"."recovery_codes_used_once"();
