-- S7.5-T07 (ADR-0054) : boutiques publiques, quartier, « boutiques près de chez moi ».

-- 1. Quartier de la boutique (liste officielle de la livraison ; vide = « Autre quartier » ou pas encore choisi)
ALTER TABLE "vendors"."shops" ADD COLUMN "neighborhood" VARCHAR(80);
ALTER TABLE "vendors"."shops" ADD CONSTRAINT "shops_neighborhood_check" CHECK (
    "neighborhood" IS NULL OR (char_length("neighborhood") BETWEEN 2 AND 80 AND "neighborhood" = btrim("neighborhood"))
);

-- 2. Villes déjà saisies ramenées au nom officiel quand elles y correspondent (casse et accents ignorés) ;
--    les autres restent telles quelles jusqu'à ce que le vendeur choisisse dans la liste.
UPDATE "vendors"."shops" AS s
SET "city" = c."name"
FROM (VALUES ('Libreville'), ('Port-Gentil'), ('Franceville'), ('Lambaréné'), ('Oyem'), ('Moanda'), ('Mouila'),
             ('Tchibanga'), ('Koulamoutou'), ('Bitam'), ('Mitzic'), ('Lastourville'), ('Makokou')) AS c("name")
WHERE s."city" <> c."name"
  AND lower(translate(replace(s."city", ' ', '-'), 'ÀÂÄÉÈÊËÎÏÔÖÙÛÜÇàâäéèêëîïôöùûüç', 'AAAEEEEIIOOUUUCaaaeeeeiioouuuc'))
    = lower(translate(c."name", 'ÀÂÄÉÈÊËÎÏÔÖÙÛÜÇàâäéèêëîïôöùûüç', 'AAAEEEEIIOOUUUCaaaeeeeiioouuuc'));

-- 3. Copie publique de la boutique dans le catalogue (le catalogue ne lit jamais les tables de vendors) :
--    quartier, description, boutique officielle, active (non suspendue), date de validation.
ALTER TABLE "catalog"."sellers"
    ADD COLUMN "neighborhood" VARCHAR(80),
    ADD COLUMN "description" VARCHAR(500) NOT NULL DEFAULT '',
    ADD COLUMN "official" BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN "active" BOOLEAN NOT NULL DEFAULT true,
    ADD COLUMN "since" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

UPDATE "catalog"."sellers" AS se
SET "city" = s."city",
    "neighborhood" = s."neighborhood",
    "description" = s."description",
    "official" = (s."kind" = 'KEMDIA'),
    "active" = (s."status" = 'ACTIVE'),
    "since" = COALESCE(s."reviewed_at", s."submitted_at"),
    "updated_at" = CURRENT_TIMESTAMP
FROM "vendors"."shops" AS s
WHERE s."id" = se."shop_id";

-- Page publique par son adresse ; annuaire par ville
CREATE UNIQUE INDEX "sellers_slug_key" ON "catalog"."sellers" ("slug");
CREATE INDEX "sellers_active_city_idx" ON "catalog"."sellers" ("active", "city");
