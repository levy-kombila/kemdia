-- S8-T03 (ADR-0058) : import du vrai catalogue par l'équipe Catalogue. Référence du produit dans le fichier d'import,
-- unique par boutique (en minuscules) : relancer le même fichier ne crée rien deux fois.
ALTER TABLE "catalog"."products" ADD COLUMN "import_reference" VARCHAR(40);

ALTER TABLE "catalog"."products"
    ADD CONSTRAINT "products_import_reference_check" CHECK (
        "import_reference" IS NULL
        OR ("import_reference" = lower("import_reference") AND "import_reference" ~ '^[a-z0-9][a-z0-9._/-]{0,39}$')
    );

CREATE UNIQUE INDEX "products_shop_id_import_reference_key"
    ON "catalog"."products" ("shop_id", "import_reference");
