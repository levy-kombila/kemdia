-- Compte de test des parcours de bout en bout (S4-T05). Inséré par la CI dans sa base ÉPHÉMÈRE
-- (détruite à la fin du job), jamais dans la démo. Mot de passe : E2e-Kemdia-2026 (haché en Argon2id,
-- mêmes réglages que l'API). Relancer ce fichier ne change rien.
INSERT INTO "identity"."accounts"
  ("id", "first_name", "last_name", "email", "password_hash", "status", "email_verified_at", "updated_at")
VALUES (
  '0e2e0000-0000-4000-8000-000000000001',
  'Awa', 'Testeuse', 'e2e@kemdia.test',
  '$argon2id$v=19$m=19456,t=2,p=1$ufEYzS6ytasl8iqSYhzX7A$zYn/ogqlE/5RH3oahXfwvzyiIUNvMDAKB2OhrUHOIlw',
  'ACTIVE', now(), now()
)
ON CONFLICT ("id") DO NOTHING;
