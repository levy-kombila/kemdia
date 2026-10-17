-- Vérification des vendeurs, KYC (S6-T08, ADR-0039 ; BR-024). Migration d'ajout : la version précédente de l'API ignore
-- les nouvelles tables. Numéros sensibles et photos sont CHIFFRÉS par l'API (AES-256-GCM, clé KYC_ENCRYPTION_KEY) :
-- la base ne voit jamais le numéro de la pièce, le compte de versement ni les photos en clair.

-- CreateEnum
CREATE TYPE "vendors"."kyc_status" AS ENUM ('DRAFT', 'PENDING', 'APPROVED', 'REJECTED');
CREATE TYPE "vendors"."kyc_holder_kind" AS ENUM ('INDIVIDUAL', 'COMPANY');
CREATE TYPE "vendors"."kyc_id_type" AS ENUM ('CNI', 'PASSEPORT', 'CARTE_SEJOUR');
CREATE TYPE "vendors"."kyc_payout_method" AS ENUM ('AIRTEL', 'MOOV', 'BANK');
CREATE TYPE "vendors"."kyc_document_kind" AS ENUM ('ID_FRONT', 'ID_BACK', 'RCCM');

-- CreateTable : un dossier par boutique
CREATE TABLE "vendors"."kyc_files" (
    "shop_id" UUID NOT NULL,
    "status" "vendors"."kyc_status" NOT NULL DEFAULT 'DRAFT',
    "holder_kind" "vendors"."kyc_holder_kind" NOT NULL,
    "legal_name" VARCHAR(100) NOT NULL,
    "id_type" "vendors"."kyc_id_type" NOT NULL,
    "id_number_box" BYTEA NOT NULL,
    "id_number_end" VARCHAR(4) NOT NULL,
    "rccm_number" VARCHAR(40),
    "payout_method" "vendors"."kyc_payout_method" NOT NULL,
    "payout_account_box" BYTEA NOT NULL,
    "payout_account_end" VARCHAR(4) NOT NULL,
    "payout_holder" VARCHAR(100) NOT NULL,
    "submitted_at" TIMESTAMPTZ(3),
    "reviewed_by" UUID,
    "reviewed_at" TIMESTAMPTZ(3),
    "rejection_reason" VARCHAR(300),
    "documents_purge_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "kyc_files_pkey" PRIMARY KEY ("shop_id")
);

-- CreateTable : photos du dossier (une par sorte), chiffrées
CREATE TABLE "vendors"."kyc_documents" (
    "id" UUID NOT NULL,
    "shop_id" UUID NOT NULL,
    "kind" "vendors"."kyc_document_kind" NOT NULL,
    "box" BYTEA NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "kyc_documents_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "kyc_files_status_submitted_at_shop_id_idx" ON "vendors"."kyc_files"("status", "submitted_at", "shop_id");
CREATE INDEX "kyc_files_documents_purge_at_idx" ON "vendors"."kyc_files"("documents_purge_at");
CREATE UNIQUE INDEX "kyc_documents_shop_id_kind_key" ON "vendors"."kyc_documents"("shop_id", "kind");

-- AddForeignKey
ALTER TABLE "vendors"."kyc_files" ADD CONSTRAINT "kyc_files_shop_id_fkey" FOREIGN KEY ("shop_id") REFERENCES "vendors"."shops"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "vendors"."kyc_documents" ADD CONSTRAINT "kyc_documents_shop_id_fkey" FOREIGN KEY ("shop_id") REFERENCES "vendors"."kyc_files"("shop_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ─── Règles que Prisma ne sait pas décrire (ajoutées à la main) ─────────────────────────────

-- Mêmes valeurs que KYC_LIMITS (@kemdia/contracts) et le domaine (kyc.ts)
ALTER TABLE "vendors"."kyc_files"
    -- Entreprise ⇔ RCCM
    ADD CONSTRAINT "kyc_files_rccm_check" CHECK (
        ("holder_kind" = 'COMPANY') = ("rccm_number" IS NOT NULL)
        AND ("rccm_number" IS NULL OR char_length("rccm_number") BETWEEN 5 AND 40)
    ),
    ADD CONSTRAINT "kyc_files_names_check" CHECK (
        char_length(btrim("legal_name")) BETWEEN 2 AND 100 AND char_length(btrim("payout_holder")) BETWEEN 2 AND 100
    ),
    -- Boîtes chiffrées : version (1 octet) + vecteur (12) + étiquette (16) + au moins 1 octet ; 4 derniers caractères
    ADD CONSTRAINT "kyc_files_boxes_check" CHECK (
        octet_length("id_number_box") BETWEEN 30 AND 200 AND octet_length("payout_account_box") BETWEEN 30 AND 200
        AND char_length("id_number_end") BETWEEN 1 AND 4 AND char_length("payout_account_end") BETWEEN 1 AND 4
    ),
    -- Envoyé ⇔ date d'envoi ; décidé ⇔ qui et quand ; refusé ⇔ motif ; effacement prévu seulement après une décision
    ADD CONSTRAINT "kyc_files_status_check" CHECK (
        ("status" = 'DRAFT' OR "submitted_at" IS NOT NULL)
        AND (("status" IN ('APPROVED', 'REJECTED')) = ("reviewed_at" IS NOT NULL AND "reviewed_by" IS NOT NULL))
        AND (("status" = 'REJECTED') = ("rejection_reason" IS NOT NULL))
        AND ("rejection_reason" IS NULL OR char_length(btrim("rejection_reason")) BETWEEN 5 AND 300)
        AND ("documents_purge_at" IS NULL OR "status" IN ('APPROVED', 'REJECTED'))
    );

-- Photo chiffrée : 5 Mo au plus (une photo réencodée en WebP fait quelques centaines de Ko)
ALTER TABLE "vendors"."kyc_documents"
    ADD CONSTRAINT "kyc_documents_size_check" CHECK (octet_length("box") BETWEEN 64 AND 5242880);

-- Une boutique Kemdia n'a pas de dossier (elle ne reçoit aucun versement)
ALTER TABLE "vendors"."kyc_files"
    ADD CONSTRAINT "kyc_files_not_kemdia_check" CHECK ("shop_id" <> '6b656d64-6961-4000-8000-000000000001'::uuid);
