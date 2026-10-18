-- Espace de l'équipe (S6-T05, ADR-0036) : données des parcours de bout en bout. Insérées par la CI dans sa base
-- ÉPHÉMÈRE, APRÈS compte-e2e.sql et photos-vendeur-e2e.sql, jamais dans la démo. Mot de passe des deux comptes :
-- E2e-Kemdia-2026 (même empreinte Argon2id que compte-e2e.sql).
--
-- Relancer ce fichier REMET À ZÉRO l'état de départ des parcours (2FA du compte d'équipe, boutique à examiner,
-- produits à modérer) : pratique sur un poste de développement, sans effet sur le reste de la base.

-- GARDE-FOU (relecture de sécurité S6-T05) : ce fichier crée un ADMINISTRATEUR dont le mot de passe est public. Il refuse
-- de s'exécuter sans le réglage de session « kemdia.e2e = on », que seule la CI passe :
--   PGOPTIONS='-c kemdia.e2e=on' psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f apps/web/e2e/fixtures/equipe-e2e.sql
-- Lancé par erreur sur la démo ou la production, il s'arrête ici sans rien écrire.
-- Arrêt à la première erreur MÊME sans « -v ON_ERROR_STOP=1 », et tout le fichier dans une seule transaction : refusé,
-- il n'écrit rien du tout (relecture de sécurité S6-T06).
\set ON_ERROR_STOP on
BEGIN;

DO $$
BEGIN
  IF current_setting('kemdia.e2e', true) IS DISTINCT FROM 'on' THEN
    RAISE EXCEPTION 'equipe-e2e.sql : données de test refusées (réglage kemdia.e2e absent)';
  END IF;
END
$$;

-- Compte d'équipe : administrateur (donc aussi modérateur), double authentification PAS encore activée.
INSERT INTO "identity"."accounts"
  ("id", "first_name", "last_name", "email", "password_hash", "status", "email_verified_at", "updated_at")
VALUES (
  '0e2e0000-0000-4000-8000-000000000002',
  'Ines', 'Equipe', 'equipe-e2e@kemdia.test',
  '$argon2id$v=19$m=19456,t=2,p=1$ufEYzS6ytasl8iqSYhzX7A$zYn/ogqlE/5RH3oahXfwvzyiIUNvMDAKB2OhrUHOIlw',
  'ACTIVE', now(), now()
)
ON CONFLICT ("id") DO NOTHING;
INSERT INTO "identity"."account_roles" ("account_id", "role")
VALUES ('0e2e0000-0000-4000-8000-000000000002', 'ADMIN')
ON CONFLICT DO NOTHING;
DELETE FROM "identity"."second_factors" WHERE "account_id" = '0e2e0000-0000-4000-8000-000000000002';
DELETE FROM "identity"."sessions" WHERE "account_id" = '0e2e0000-0000-4000-8000-000000000002';

-- Futur vendeur : sa demande de boutique attend l'administration.
INSERT INTO "identity"."accounts"
  ("id", "first_name", "last_name", "email", "password_hash", "status", "email_verified_at", "updated_at")
VALUES (
  '0e2e0000-0000-4000-8000-000000000003',
  'Pierre', 'Vendeur', 'vendeur-e2e@kemdia.test',
  '$argon2id$v=19$m=19456,t=2,p=1$ufEYzS6ytasl8iqSYhzX7A$zYn/ogqlE/5RH3oahXfwvzyiIUNvMDAKB2OhrUHOIlw',
  'ACTIVE', now(), now()
)
ON CONFLICT ("id") DO NOTHING;
DELETE FROM "identity"."account_roles"
WHERE "account_id" = '0e2e0000-0000-4000-8000-000000000003' AND "role" = 'VENDOR';
INSERT INTO "vendors"."shops"
  ("id", "kind", "owner_account_id", "name", "name_key", "slug", "city", "contact_phone", "description", "status",
   "submitted_at", "updated_at")
VALUES (
  '0e2e0000-0000-4000-8000-0000000000a2', 'PARTNER', '0e2e0000-0000-4000-8000-000000000003',
  'Boutique en attente E2E', 'boutique en attente e2e', 'boutique-en-attente-e2e', 'Port-Gentil', '+241060000000',
  'Demande de boutique de test des parcours de bout en bout.', 'PENDING', now(), now()
)
ON CONFLICT ("id") DO UPDATE SET
  "status" = 'PENDING', "status_reason" = NULL, "name_key" = 'boutique en attente e2e', "reviewed_by" = NULL,
  "reviewed_at" = NULL, "submitted_at" = now(), "updated_at" = now();

-- Deux produits de la boutique « Atelier E2E » à modérer : l'un avec une photo (à valider), l'autre sans (à refuser).
INSERT INTO "catalog"."products"
  ("id", "slug", "title", "description", "category_id", "images", "status", "price", "search_text", "updated_at",
   "shop_id", "submitted_at")
SELECT p.*
FROM (
  SELECT
    '0e2e0000-0000-4000-8000-0000000000b3'::uuid, 'sac-raphia-moderation-e2e', 'Sac en raphia modération E2E',
    'Produit de test : il attend la décision de la modération.', c."id",
    ARRAY['/images/v/0e2e0000-0000-4000-8000-0000000000c3.webp'], 'PENDING'::catalog.product_status, 15000,
    'sac en raphia moderation e2e', now(), '0e2e0000-0000-4000-8000-0000000000a1'::uuid, now()
  FROM "catalog"."categories" c ORDER BY c."slug" LIMIT 1
) p
UNION ALL
SELECT q.*
FROM (
  SELECT
    '0e2e0000-0000-4000-8000-0000000000b4'::uuid, 'bracelet-refus-e2e', 'Bracelet à refuser E2E',
    'Produit de test : la modération le refuse avec un motif.', c."id",
    ARRAY[]::text[], 'PENDING'::catalog.product_status, 3000,
    'bracelet a refuser e2e', now(), '0e2e0000-0000-4000-8000-0000000000a1'::uuid, now()
  FROM "catalog"."categories" c ORDER BY c."slug" LIMIT 1
) q
ON CONFLICT ("id") DO UPDATE SET
  "status" = 'PENDING', "moderation_reason" = NULL, "reviewed_by" = NULL, "reviewed_at" = NULL,
  "submitted_at" = now(), "updated_at" = now();

INSERT INTO "catalog"."product_variants" ("id", "product_id", "sku", "name", "price", "stock", "updated_at")
VALUES
  ('0e2e0000-0000-4000-8000-0000000000b5', '0e2e0000-0000-4000-8000-0000000000b3', 'VE2E0003-1', 'Naturel',
   15000, 4, now()),
  ('0e2e0000-0000-4000-8000-0000000000b6', '0e2e0000-0000-4000-8000-0000000000b4', 'VE2E0004-1', 'Unique',
   3000, 10, now())
ON CONFLICT ("id") DO NOTHING;

-- Photo du produit à valider : copie de la photo de photos-vendeur-e2e.sql (une photo ne se modifie jamais).
INSERT INTO "catalog"."product_images" ("id", "product_id", "large", "small", "width", "height", "sha256")
SELECT '0e2e0000-0000-4000-8000-0000000000c3', '0e2e0000-0000-4000-8000-0000000000b3', i."large", i."small", i."width",
  i."height", i."sha256"
FROM "catalog"."product_images" i
WHERE i."id" = '0e2e0000-0000-4000-8000-0000000000c1'
ON CONFLICT ("id") DO NOTHING;

-- Livraisons (S7-T02) : une commande prête à remettre au transporteur (boutique Kemdia, paiement à la livraison), d'un
-- client de test. Une commande et son expédition ne s'effacent jamais : relancer ce fichier ne la remet PAS « prête »
-- (sur un poste de développement, changer le numéro KMD-E2ELVR pour rejouer le parcours).
INSERT INTO "identity"."accounts"
  ("id", "first_name", "last_name", "email", "password_hash", "status", "email_verified_at", "updated_at")
VALUES (
  '0e2e0000-0000-4000-8000-000000000004',
  'Lea', 'Livraison', 'livraison-e2e@kemdia.test',
  '$argon2id$v=19$m=19456,t=2,p=1$ufEYzS6ytasl8iqSYhzX7A$zYn/ogqlE/5RH3oahXfwvzyiIUNvMDAKB2OhrUHOIlw',
  'ACTIVE', now(), now()
)
ON CONFLICT ("id") DO NOTHING;
INSERT INTO "orders"."orders"
  ("id", "reference", "account_id", "idempotency_key", "request_hash", "status", "payment_method", "subtotal",
   "delivery_fee", "total", "delivery_name", "delivery_phone", "delivery_city_id", "delivery_city_name",
   "delivery_neighborhood", "delivery_landmark", "delivery_days_min", "delivery_days_max")
VALUES (
  '0e2e0000-0000-4000-8000-0000000000d1', 'KMD-E2ELVR', '0e2e0000-0000-4000-8000-000000000004',
  '0e2e0000-0000-4000-8000-0000000000d2', repeat('e2', 32), 'CONFIRMED', 'COD', 9000, 1000, 10000,
  'Lea Livraison', '+241077123456', 'libreville', 'Libreville', 'Glass', 'Portail vert, test E2E', 1, 2
)
ON CONFLICT ("id") DO NOTHING;
INSERT INTO "orders"."order_items"
  ("order_id", "variant_id", "product_id", "shop_id", "title", "variant_name", "unit_price", "quantity", "line_total",
   "position")
VALUES (
  '0e2e0000-0000-4000-8000-0000000000d1', '0e2e0000-0000-4000-8000-0000000000d3',
  '0e2e0000-0000-4000-8000-0000000000d4', '6b656d64-6961-4000-8000-000000000001', 'Panier tressé livraison E2E',
  'Unique', 9000, 1, 9000, 0
)
ON CONFLICT DO NOTHING;
INSERT INTO "orders"."order_shop_parts" ("order_id", "shop_id", "status", "subtotal", "item_count", "decided_at")
VALUES ('0e2e0000-0000-4000-8000-0000000000d1', '6b656d64-6961-4000-8000-000000000001', 'ACCEPTED', 9000, 1, now())
ON CONFLICT DO NOTHING;
INSERT INTO "orders"."order_status_history" ("id", "order_id", "status")
SELECT '0e2e0000-0000-4000-8000-0000000000d5', '0e2e0000-0000-4000-8000-0000000000d1', 'CONFIRMED'
WHERE NOT EXISTS (
  SELECT 1 FROM "orders"."order_status_history" WHERE "id" = '0e2e0000-0000-4000-8000-0000000000d5'
);

COMMIT;
