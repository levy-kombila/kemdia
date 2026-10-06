# ADR-0010 — API REST : contrat décrit par Zod, OpenAPI généré, limitation de débit

- **Statut** : Accepté
- **Date** : 2026-10-06
- **Tâche** : S3-T04

## Contexte

Le module `catalog` (S3-T03) doit être exposé en HTTP sous `/api/v1` ([ADR-0007](0007-socle-api-nestjs.md)),
avec une documentation OpenAPI et une limitation de débit. Le site l'appellera au S3-T05, **depuis son serveur** :
toutes les requêtes des visiteurs arriveront donc de la même adresse.

Une documentation écrite à la main finit toujours par dire autre chose que le code. Il faut une source unique.

## Décision

| Sujet                  | Choix                                                                                                                                                                    | Raison                                                                                                                   |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------ |
| Source du contrat      | **Schémas Zod** (`interface/schemas.ts`) : validation des corps, documentation et tests                                                                                  | Une seule définition : la documentation ne peut pas diverger du code                                                     |
| Documentation          | **OpenAPI 3.1** généré par `z.toJSONSchema` ; servi en `/api/v1/openapi.json` et versionné dans `docs/api/openapi.json`                                                  | Chaque changement de l'API apparaît dans le diff de la PR ; un test échoue si le fichier n'est pas à jour                |
| Tests de contrat       | Chaque réponse des tests HTTP (en mémoire **et** sur la vraie base, 50 produits, 112 catégories) est validée par son schéma Zod                                          | Prouve que l'API renvoie ce que la documentation promet                                                                  |
| Page de documentation  | Swagger UI **servi par l'API elle-même** (`/api/docs`), liste fermée de 3 fichiers, CSP propre : aucun CDN, aucun script tiers                                           | Même règle que le site (pas de CDN) ; télémétrie du paquet (`@scarf/scarf`) bloquée                                      |
| Activation             | `API_DOCS` : activée par défaut en développement, **désactivée en production**                                                                                           | Moins de surface exposée ; activable pour la démo                                                                        |
| Validation des entrées | Corps : `StandardSchemaValidationPipe` de NestJS 12 avec le schéma Zod, champs inconnus **refusés** ; requêtes de recherche : validation tolérante (`product-search.ts`) | Un corps invalide est une erreur (400) ; un lien de recherche abîmé doit quand même afficher une liste                   |
| Limitation de débit    | `@nestjs/throttler` : 120 requêtes/min par adresse IP (`RATE_LIMIT_PER_MINUTE`), 30/min pour la disponibilité ; 429 en français + `Retry-After`                          | Protège la base ; l'adresse vient de `req.ip` (TRUST_PROXY) : `X-Forwarded-For` n'est cru que derrière un relais déclaré |
| Appels du site         | Clé secrète `API_INTERNAL_KEY` (en-tête `X-Kemdia-Internal-Key`, comparée en temps constant) : le site n'est pas limité                                                  | Sinon, 120 visiteurs simultanés bloqueraient tout le site (une seule adresse)                                            |
| Cache                  | Lectures : `Cache-Control: public, max-age=60, stale-while-revalidate=300` + `ETag` ; disponibilité : `no-store`                                                         | Le catalogue change rarement ; le stock, souvent                                                                         |
| Noms                   | Champs JSON et paramètres en anglais (`price`, `pageSize`), valeurs métier en français (`prix-asc`, `PRODUIT_INDISPONIBLE`)                                              | Conventions usuelles d'une API ; les valeurs reprennent celles du site                                                   |

## Options écartées

- **`@nestjs/swagger` (décorateurs sur des classes)** : deux descriptions à tenir à jour (classes et schémas Zod), et dépendance à `class-validator`.
- **Documentation écrite à la main** : diverge sans prévenir.
- **Swagger UI ou Redoc depuis un CDN** : contraire à la règle « aucun CDN » du projet (vie privée, CSP).
- **Limite partagée entre instances (Redis)** : inutile tant qu'il n'y a qu'une instance ; prévu au S4 avec Redis.

## Conséquences

- ➕ Documentation exacte par construction, vérifiée à chaque PR (validité OpenAPI 3.1, fichier à jour, réponses conformes).
- ➕ La limitation de débit ne gênera pas le site au S3-T05.
- ➖ Après une modification des schémas : `pnpm --filter @kemdia/api openapi` (le test le rappelle).
- ➖ Limite en mémoire : remise à zéro au redémarrage, non partagée entre plusieurs instances (Redis au S4).
- ➖ La page de documentation autorise les styles en ligne (`'unsafe-inline'`, exigé par Swagger UI) : seulement sur `/api/docs`, jamais sur les routes de l'API.
