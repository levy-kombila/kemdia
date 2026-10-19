-- Test d'intrusion (S7-T07, ADR-0046) : sessions des comptes de test pour OWASP ZAP, dans la base ÉPHÉMÈRE de la CI.
-- Après les données des parcours de bout en bout (apps/web/e2e/fixtures : client, vendeuse, administratrice).
--
-- Les jetons sont tirés au hasard par la CI à chaque passage ; seule leur empreinte SHA-256 est écrite (comme l'API).
--   docker exec -e PGOPTIONS='-c kemdia.e2e=on' -i <base> psql -v client=<empreinte> -v vendeur=<…> -v equipe=<…> \
--     -U kemdia -d kemdia < .github/zap/sessions.sql
--
-- GARDE-FOU : refusé sans le réglage « kemdia.e2e = on », que seule la CI passe (même règle que equipe-e2e.sql).
\set ON_ERROR_STOP on
BEGIN;

DO $$
BEGIN
  IF current_setting('kemdia.e2e', true) IS DISTINCT FROM 'on' THEN
    RAISE EXCEPTION 'sessions.sql : sessions de test refusées (réglage kemdia.e2e absent)';
  END IF;
END
$$;

-- Session de l'équipe : double authentification « confirmée maintenant » (la CI la renouvelle pendant le scan, car
-- les routes de l'équipe exigent une confirmation de moins de 15 minutes) ; deux facteurs activés pour le compte.
INSERT INTO "identity"."sessions" ("id", "account_id", "token_hash", "expires_at", "second_factor_at", "user_agent")
VALUES
  (gen_random_uuid(), '0e2e0000-0000-4000-8000-000000000001', :'client', now() + interval '1 day', NULL, 'OWASP ZAP (CI)'),
  (gen_random_uuid(), '0e2e0000-0000-4000-8000-000000000004', :'vendeur', now() + interval '1 day', NULL, 'OWASP ZAP (CI)'),
  (gen_random_uuid(), '0e2e0000-0000-4000-8000-000000000002', :'equipe', now() + interval '1 day', now(), 'OWASP ZAP (CI)');

COMMIT;
