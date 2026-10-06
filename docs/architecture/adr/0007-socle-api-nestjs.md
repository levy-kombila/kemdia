# ADR-0007 — Socle de l'API : NestJS 12 en modules ES, configuration validée, journaux sans données personnelles

- **Statut** : Accepté
- **Date** : 2026-10-06
- **Tâche** : S3-T01

## Contexte

L'[ADR-0006](0006-monolithe-modulaire-7-modules.md) fixe le monolithe modulaire NestJS en architecture hexagonale.
Il reste à choisir les briques techniques du socle, avant d'écrire le premier module (`catalog`, S3-T03).

NestJS 12 (2026) est livré uniquement en **modules ES** (le format standard de JavaScript, `import`/`export`) ;
la documentation recommande Vitest pour les nouveaux projets.

## Décision

| Sujet                   | Choix                                                                                           | Raison                                                                                     |
| ----------------------- | ----------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| Framework               | **NestJS 12** sur Express 5, modules ES                                                         | Format natif de NestJS 12 ; pas de couche de compatibilité                                 |
| Construction            | `tsc` seul (`dist/`)                                                                            | Une dépendance de moins que la CLI Nest ; le code produit est lisible                      |
| Tests                   | **Vitest** (comme le site) + SWC pour compiler les décorateurs, Supertest pour HTTP             | Un seul outil de test dans le dépôt                                                        |
| Configuration           | **Zod** : schéma unique, validé **avant** la création de l'application (`loadConfig`)           | Une variable fausse arrête l'API au démarrage, avec un message en français, sans la valeur |
| Journaux                | **pino** (`nestjs-pino`) en JSON : méthode, chemin **sans** paramètres, statut, durée, id       | Aucune donnée personnelle (loi n°001/2011) ; masquage automatique des champs sensibles     |
| Erreurs                 | Format standard **Problem Details** (RFC 9457), message générique pour toute erreur imprévue    | Jamais de trace technique côté client (leçon de l'ancien site)                             |
| Adresses                | `/api/health` sans version ; routes métier sous **`/api/v1`**                                   | Le contrôle de santé reste stable ; une v2 pourra coexister                                |
| Sécurité HTTP           | Helmet (CSP `default-src 'none'`), CORS **fermé** par défaut, corps JSON ≤ 100 Ko, arrêt propre | Le site appelle l'API côté serveur : aucun navigateur n'a besoin d'y accéder directement   |
| Respect de l'hexagonale | Test `test/architecture.test.ts` qui lit les `import` de `src/modules`                          | Une règle non vérifiée finit par être contournée ; ce test bloque la PR                    |

## Options écartées

- **Fastify** à la place d'Express : plus rapide, mais l'écart est négligeable pour ~500 produits et l'écosystème Express est mieux connu.
- **`@nestjs/config`** : utile pour des configurations multiples ; ici un seul schéma Zod suffit et se teste sans NestJS.
- **Jest** : resterait le seul projet du dépôt à l'utiliser.
- **Règles ESLint** pour l'architecture : les chemins relatifs (`../../`) rendent les règles fragiles ; le test résout les vrais chemins.

## Conséquences

- ➕ Même outil de test et même style de configuration que le site ; démarrage refusé si la configuration est fausse.
- ➕ Les règles de l'architecture sont vérifiées à chaque PR, pas seulement en revue.
- ➖ Les imports internes portent l'extension `.js` (règle des modules ES dans Node.js), même dans les fichiers `.ts`.
- ➖ La validation des requêtes (S3-T04) devra utiliser le support _Standard Schema_ de NestJS 12 avec Zod, encore récent.
