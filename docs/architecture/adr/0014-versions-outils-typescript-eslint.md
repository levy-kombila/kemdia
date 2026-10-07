# ADR-0014 — Versions des outils : TypeScript 6.0 (pont vers la 7), ESLint 10 là où c'est compatible

- **Statut** : Accepté
- **Date** : 2026-10-07
- **Tâche** : S3-T08

## Contexte

Deux mises à jour majeures étaient en attente dans la dette du Sprint 3 :

- **TypeScript 7.0** (compilateur réécrit en Go, environ 10 fois plus rapide) est sorti. Mais il **n'a pas encore l'interface de programmation**
  (_Compiler API_) dont se servent nos outils : `typescript-eslint` (ses règles « typées ») déclare `typescript < 6.1`,
  et Next.js utilise l'interface pour vérifier les types pendant `next build`. Cette interface est annoncée pour la **7.1** (automne 2026).
  La **6.0** est la version « pont » officielle : même langage, compatible avec nos outils, elle signale déjà ce que la 7 refusera.
- **ESLint 10** est sorti. `typescript-eslint` et `eslint-plugin-react-hooks` le prennent en charge, mais la configuration de Next.js
  (`eslint-config-next` 16.4) s'appuie sur trois extensions qui ne le déclarent pas encore : `eslint-plugin-react`, `eslint-plugin-import`,
  `eslint-plugin-jsx-a11y`.

Projet en 5.9 / ESLint 9 jusqu'ici.

## Décision

| Sujet        | Choix                                                                                           | Raison                                                                                                   |
| ------------ | ----------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| TypeScript   | **6.0.3 partout** (`~6.0.3` : correctifs seulement), site, API et contrat                       | Tous nos outils l'acceptent ; nos `tsconfig` n'utilisent aucune option retirée par la 7                  |
| Passage en 7 | Quand la **7.1** sort ET que `typescript-eslint` et Next.js la déclarent compatible             | Avant, il faudrait forcer des compatibilités non prévues : risque de règles ou de builds faux en silence |
| ESLint       | **10** pour l'API et le contrat ; **9** pour le site, jusqu'à ce que `eslint-config-next` suive | Pas de dépendance forcée ; les majeures restent exclues de Dependabot, on vérifie à chaque sprint        |

Effet visible immédiat : TypeScript 6 infère mieux un type de Prisma, une conversion devenue inutile a été retirée (règle `no-unnecessary-type-assertion`).

## Options écartées

- **TypeScript 7 tout de suite** (en forçant les compatibilités) : `typescript-eslint` et la vérification des types de Next.js s'appuient
  sur l'interface absente ; plantages ou analyses incomplètes.
- **TypeScript 7 seulement pour `pnpm typecheck`** (à côté de la 6) : plus rapide, mais deux compilateurs à maintenir pour un gain
  de quelques secondes sur un projet de cette taille.
- **ESLint 10 partout en forçant** : les trois extensions de Next.js pourraient ignorer des règles sans prévenir.
- **Rester en 5.9 / ESLint 9 partout** : on repousserait des montées de version qui sont prêtes et sans risque.

## Conséquences

- ➕ Les montées vers TypeScript 7.1 et ESLint 10 (site) seront petites : le code est déjà prêt.
- ➖ Deux versions d'ESLint dans le dépôt pendant quelque temps (une par paquet : aucun conflit, `pnpm` les isole).
- 🔜 À revoir à chaque fin de sprint (les majeures sont exclues de Dependabot) : sortie de TypeScript 7.1 ; `eslint-config-next` compatible avec ESLint 10.
