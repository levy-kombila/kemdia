-- Connexion et sessions (S4-T03, ADR-0017).

-- CreateTable
CREATE TABLE "identity"."login_guards" (
    "identifier" VARCHAR(254) NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "locked_until" TIMESTAMPTZ(3),
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "login_guards_pkey" PRIMARY KEY ("identifier")
);

-- CreateIndex
CREATE INDEX "login_guards_updated_at_idx" ON "identity"."login_guards"("updated_at");

-- CreateIndex
CREATE INDEX "sessions_expires_at_idx" ON "identity"."sessions"("expires_at");

-- Règles que Prisma ne sait pas décrire (ajoutées à la main)
ALTER TABLE "identity"."login_guards"
    ADD CONSTRAINT "login_guards_attempts_check" CHECK ("attempts" >= 0);
