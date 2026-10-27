-- S8-T07 (ADR-0064) : compteurs partagés par toutes les instances de l'API (limites de débit, essais de coupons,
-- renvois de factures, budget des corrections de la recherche), auparavant gardés dans la mémoire de chaque instance.
CREATE SCHEMA IF NOT EXISTS "platform";

CREATE TABLE "platform"."rate_counters" (
    "key" VARCHAR(200) NOT NULL,
    "hits" INTEGER NOT NULL,
    "window_ends_at" TIMESTAMPTZ(3) NOT NULL,
    "blocked_until" TIMESTAMPTZ(3),
    CONSTRAINT "rate_counters_pkey" PRIMARY KEY ("key")
);

-- Ménage des compteurs terminés
CREATE INDEX "rate_counters_window_ends_at_idx" ON "platform"."rate_counters"("window_ends_at");
