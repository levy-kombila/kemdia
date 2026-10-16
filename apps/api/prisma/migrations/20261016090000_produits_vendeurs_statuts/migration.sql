-- Produits des vendeurs (S6-T02, ADR-0033), étape 1 : nouveaux statuts de produit. Migration à part : PostgreSQL
-- n'autorise pas l'emploi d'une valeur d'énumération dans la transaction qui l'ajoute (contraintes de l'étape 2).
-- PENDING : en attente de modération (BR-003) ; REJECTED : refusé par la modération (motif montré au vendeur).

-- AlterEnum
ALTER TYPE "catalog"."product_status" ADD VALUE 'PENDING';

-- AlterEnum
ALTER TYPE "catalog"."product_status" ADD VALUE 'REJECTED';
