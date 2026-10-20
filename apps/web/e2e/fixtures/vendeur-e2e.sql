-- Espace vendeur (S6-T06, ADR-0037) : données des parcours de bout en bout. Insérées par la CI dans sa base ÉPHÉMÈRE,
-- jamais dans la démo. Mot de passe des deux comptes : E2e-Kemdia-2026 (même empreinte Argon2id que compte-e2e.sql).
--
-- Relancer ce fichier REMET À ZÉRO l'état de départ des parcours (pas de boutique pour Jean, boutique de Fatou sans
-- produit) : pratique sur un poste de développement, sans effet sur le reste de la base.
--
-- GARDE-FOU (comme equipe-e2e.sql) : refusé sans le réglage de session « kemdia.e2e = on », que seule la CI passe :
--   PGOPTIONS='-c kemdia.e2e=on' psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f apps/web/e2e/fixtures/vendeur-e2e.sql
-- Arrêt à la première erreur MÊME sans « -v ON_ERROR_STOP=1 », et tout le fichier dans une seule transaction : refusé,
-- il n'écrit rien du tout (relecture de sécurité S6-T06).
\set ON_ERROR_STOP on
BEGIN;

DO $$
BEGIN
  IF current_setting('kemdia.e2e', true) IS DISTINCT FROM 'on' THEN
    RAISE EXCEPTION 'vendeur-e2e.sql : données de test refusées (réglage kemdia.e2e absent)';
  END IF;
END
$$;

INSERT INTO "identity"."accounts"
  ("id", "first_name", "last_name", "email", "password_hash", "status", "email_verified_at", "updated_at")
VALUES
  ('0e2e0000-0000-4000-8000-000000000004', 'Fatou', 'Vendeuse', 'vendeuse-e2e@kemdia.test',
   '$argon2id$v=19$m=19456,t=2,p=1$ufEYzS6ytasl8iqSYhzX7A$zYn/ogqlE/5RH3oahXfwvzyiIUNvMDAKB2OhrUHOIlw',
   'ACTIVE', now(), now()),
  ('0e2e0000-0000-4000-8000-000000000005', 'Jean', 'Sansboutique', 'sans-boutique-e2e@kemdia.test',
   '$argon2id$v=19$m=19456,t=2,p=1$ufEYzS6ytasl8iqSYhzX7A$zYn/ogqlE/5RH3oahXfwvzyiIUNvMDAKB2OhrUHOIlw',
   'ACTIVE', now(), now())
ON CONFLICT ("id") DO NOTHING;

-- Jean : aucune boutique (il fait sa demande pendant le parcours)
DELETE FROM "vendors"."shops" WHERE "owner_account_id" = '0e2e0000-0000-4000-8000-000000000005';

-- Fatou : boutique active, rôle vendeur, aucun produit au départ
INSERT INTO "identity"."account_roles" ("account_id", "role")
VALUES ('0e2e0000-0000-4000-8000-000000000004', 'VENDOR')
ON CONFLICT DO NOTHING;
INSERT INTO "vendors"."shops"
  ("id", "kind", "owner_account_id", "name", "name_key", "slug", "city", "contact_phone", "description", "status",
   "submitted_at", "updated_at")
VALUES (
  '0e2e0000-0000-4000-8000-0000000000a3', 'PARTNER', '0e2e0000-0000-4000-8000-000000000004',
  'Boutique de Fatou E2E', 'boutique de fatou e2e', 'boutique-de-fatou-e2e', 'Franceville', '+241066765432',
  'Boutique de test de l''espace vendeur (parcours de bout en bout).', 'ACTIVE', now(), now()
)
ON CONFLICT ("id") DO UPDATE SET
  "status" = 'ACTIVE', "status_reason" = NULL, "name_key" = 'boutique de fatou e2e', "reviewed_by" = NULL,
  "reviewed_at" = NULL, "updated_at" = now();
DELETE FROM "catalog"."product_images"
WHERE "product_id" IN (SELECT "id" FROM "catalog"."products" WHERE "shop_id" = '0e2e0000-0000-4000-8000-0000000000a3');
DELETE FROM "catalog"."products" WHERE "shop_id" = '0e2e0000-0000-4000-8000-0000000000a3';
-- Ses fiches communes (S7.5-T02), quand plus aucune boutique n'y vend
DELETE FROM "catalog"."listings" l
WHERE l."created_by_shop_id" = '0e2e0000-0000-4000-8000-0000000000a3'
  AND NOT EXISTS (SELECT 1 FROM "catalog"."products" p WHERE p."listing_id" = l."id");
INSERT INTO "catalog"."sellers" ("shop_id", "name", "slug", "city", "updated_at")
VALUES ('0e2e0000-0000-4000-8000-0000000000a3', 'Boutique de Fatou E2E', 'boutique-de-fatou-e2e', 'Franceville', now())
ON CONFLICT ("shop_id") DO NOTHING;
-- Dossier de vérification (S6-T08) : repart de zéro à chaque passage
DELETE FROM "vendors"."kyc_documents" WHERE "shop_id" = '0e2e0000-0000-4000-8000-0000000000a3';
DELETE FROM "vendors"."kyc_files" WHERE "shop_id" = '0e2e0000-0000-4000-8000-0000000000a3';

COMMIT;
