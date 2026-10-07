# ADR-0013 — Démo Render : API et base Neon gratuites, migrations et import au démarrage

- **Statut** : Accepté
- **Date** : 2026-10-07
- **Tâche** : S3-T07

## Contexte

La démo publique (Render Free, [démo gratuite](../../guides/demo-gratuite.md)) affichait le catalogue depuis le **fichier de démonstration**.
Depuis le S3-T06, l'API a son image Docker ([ADR-0012](0012-image-api-migrations.md)) : la démo doit maintenant montrer
**le vrai système** — site → API → PostgreSQL — sans rien payer.

Contraintes relevées sur la documentation de Render (octobre 2026) :

| Contrainte de l'offre gratuite                                                             | Conséquence                                                                       |
| ------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------- |
| La **commande avant déploiement** (_pre-deploy command_) est réservée aux offres payantes  | Impossible de lancer les migrations comme une tâche séparée (ordre de l'ADR-0012) |
| Ni console (_shell_) ni tâches ponctuelles (_one-off jobs_)                                | Impossible de lancer `db:seed` à la main sur Render                               |
| Un service gratuit **ne reçoit pas** de trafic du réseau privé                             | Le site appelle l'API par son **adresse publique** (`https://…onrender.com`)      |
| Chaque service s'endort après 15 min sans visite et met ~1 min à se réveiller              | Site **et** API dorment : la première visite réveille les deux                    |
| La base Render gratuite **expire 30 jours** après sa création (1 Go, une seule par compte) | Il faudrait la recréer chaque mois et changer l'adresse                           |

## Décision

| Sujet                | Choix                                                                                                                                                                                                    | Raison                                                                                                                   |
| -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| Base de données      | **Neon Free** (PostgreSQL 18, région Francfort `aws-eu-central-1`), connexion **directe** (pas l'adresse `-pooler`), `sslmode=require`                                                                   | Permanente (pas d'expiration), se réveille en moins d'une seconde ; la connexion directe permet le verrou des migrations |
| Image de l'API       | Publiée aussi sur **Docker Hub, publique** (`levy2025/kemdia-api`), même digest que GHCR — comme le site (S1-T22)                                                                                        | Render la tire sans identifiants ; l'image ne contient ni secret ni donnée                                               |
| Migrations + import  | Au **démarrage du conteneur**, seulement sur la démo : « Docker Command » Render = `node dist/database/start-demo.js` → migrations → import de démonstration → API                                       | Pas de commande avant déploiement en gratuit ; une seule instance ; Prisma pose un verrou de toute façon                 |
| Garde-fou            | `start-demo.js` **refuse** de tourner si `APP_ENV` ≠ `demo` ; l'import de démonstration est refusé par l'image hors démo                                                                                 | Staging et production gardent l'ordre de l'ADR-0012 (migrations à part, jamais de données de démo)                       |
| Import               | Le code de `db:seed` passe dans `src/database/demo-import.ts`, **compilé dans l'image** ; relancé à chaque démarrage (upsert, identifiants UUID v5 fixes : aucun doublon)                                | La démo se répare seule, même sur une base neuve ; ~1 s pour 112 catégories et 50 produits                               |
| Ordre de déploiement | La CI déploie **l'API d'abord** (hook `RENDER_API_DEPLOY_HOOK_URL`), attend sa version et `database: ok`, **puis** le site ; elle vérifie enfin que le site lit l'API (`/api/health` → `catalog: "api"`) | Le nouveau site ne parle jamais à une ancienne API ; une démo branchée sur le fichier par erreur se voit                 |
| Réveil               | Au démarrage du site de démo, une requête vers `/api/health` réveille l'API en arrière-plan ; `CATALOG_TIMEOUT_MS=60000` sur la démo (plafond relevé de 30 à 90 s)                                       | Le premier visiteur attend au lieu de voir une page d'erreur ; staging et production gardent 5 s                         |
| Secrets              | `DATABASE_URL` et `API_INTERNAL_KEY` uniquement dans Render (variables du service) ; dans GitHub seulement les URL des deploy hooks                                                                      | L'adresse de la base ne quitte jamais Render ; rien dans Git                                                             |
| Mode fichier du site | **Gardé** pour le développement sans base ; suppression reportée au **S3-T08** (l'ADR-0011 prévoyait le S3-T07)                                                                                          | `pnpm dev` doit marcher sans Docker pour travailler sur l'interface ; décision du 2026-10-07                             |

## Options écartées

- **Render Postgres Free** : expire au bout de 30 jours. La démo se reconstruirait seule (migrations + import au démarrage), mais il faudrait recréer la base
  et changer `DATABASE_URL` chaque mois, à la main.
- **Migrations depuis la CI** (GitHub Actions se connecte à Neon) : l'adresse de la base deviendrait un secret GitHub, et une base recréée resterait vide
  jusqu'à la fusion suivante.
- **Image GHCR privée + jeton dans Render** : un jeton GitHub de plus à faire tourner, pour une image qui ne contient rien de secret.
- **Garder la démo éveillée** (requête toutes les 10 min) : deux services éveillés en permanence dépassent les 750 heures gratuites par mois.
- **Pooler Neon (PgBouncer)** : pratique pour beaucoup de connexions, mais les verrous de session des migrations y sont mal gérés ; inutile avec 5 connexions.

## Conséquences

- ➕ La démo publique montre le vrai système (site → API → PostgreSQL), mis à jour à chaque fusion, sans coût.
- ➕ La CI prouve, à chaque PR, que l'image démarre en mode démo sur une base **vide** puis redémarre sans doublon.
- ➕ `apps/web/.env.example` est enfin dans Git (il était ignoré par `apps/web/.gitignore` depuis le S3-T05).
- ➖ Première visite après une pause : environ **1 à 2 minutes** (réveil du site, puis de l'API, migrations et import).
- ➖ L'API de démo est publique (obligatoire : pas de réseau privé en gratuit). Elle ne sert que des données de démonstration.
  `TRUST_PROXY` reste à 0 (Render ne documente pas le nombre de relais) : les appels **directs** à l'API partagent donc une seule limite
  de 120 requêtes/min. Le site n'est pas concerné (clé interne). À régler au S7 sur notre serveur, où le relais (Caddy) est connu.
- ➖ Un compte de plus (Neon). Limites gratuites : 1 Go de stockage par projet et 100 heures de calcul par mois — largement assez pour une démo.
- ➖ La démo **ne suit pas** l'ordre « migrations puis API » de l'ADR-0012 : acceptable pour un environnement sans données réelles, interdit ailleurs (garde-fou en code).
