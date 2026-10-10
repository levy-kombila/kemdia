-- Retrait des colonnes de blocage obsolètes (S5-T01, étape 2 de l'ADR-0022).
-- Le blocage après 3 échecs vit dans "identity"."login_guards" depuis le S4-T03 (ADR-0017).
-- Étape 1 (S4-T08, v0.4.0 en ligne) : le code ne lit ni n'écrit plus ces colonnes (champs @ignore).
-- Étape 2 (ici) : on les supprime. La version précédente de l'API (v0.4.0) ne les utilise pas :
-- elle continue de fonctionner pendant le déploiement (« ajouter d'abord, supprimer plus tard »).

-- La contrainte disparaîtrait avec sa colonne ; on la retire d'abord, par son nom, pour que l'intention soit lisible.
ALTER TABLE "identity"."accounts" DROP CONSTRAINT IF EXISTS "accounts_failed_logins_check";

ALTER TABLE "identity"."accounts"
    DROP COLUMN IF EXISTS "failed_logins",
    DROP COLUMN IF EXISTS "locked_until";
