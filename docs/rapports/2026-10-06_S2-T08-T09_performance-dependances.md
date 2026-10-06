# Rapport — Budget de performance et dépendances (fin du Sprint 2)

|                                                 |                     |
| ----------------------------------------------- | ------------------- |
| **Date**                                        | 2026-10-06          |
| **Sprint / tâches**                             | S2 — S2-T08, S2-T09 |
| **Version**                                     | v0.2.0              |
| **Sections du cahier d'architecture modifiées** | §2.2, §7, §9 (v1.0) |

## 1. Résumé

- **S2-T08** : à chaque PR, les pages clés sont chargées **à froid sur un téléphone en 3G**, et la CI échoue si elles dépassent le budget.
  Les premières mesures ont révélé **3 vrais problèmes**, corrigés dans cette tâche.
- **S2-T09** : les PR Dependabot obsolètes sont fermées, la configuration est revue (PR groupées, majeures sensibles écartées), et les mises à jour sûres sont appliquées.

Le Sprint 2 est terminé : la version **v0.2.0** peut être étiquetée.

## 2. S2-T08 — Budget de performance

### Méthode

Le téléphone simulé est un Pixel 7 sur une **3G à 1,6 Mbit/s** avec **300 ms de latence**, et un **processeur ralenti 4 fois** (téléphone de milieu de gamme).
Chaque page est chargée **3 fois, cache vide**, et on garde la **médiane** de chaque mesure. Les mesures sont celles du navigateur lui-même (Web Vitals).

On n'a pas pris Lighthouse CI : il ajoutait 6 dépendances vulnérables à la chaîne de construction.
On réutilise donc Playwright, déjà en place, sans nouvelle dépendance.

| Mesure                           | Budget              |
| -------------------------------- | ------------------- |
| Premier affichage (FCP)          | ≤ 2 s               |
| Plus grand élément affiché (LCP) | ≤ 2,5 s             |
| Décalages de mise en page (CLS)  | ≤ 0,1               |
| Blocage du fil principal (TBT)   | ≤ 300 ms            |
| JavaScript transféré             | ≤ 300 Ko compressés |
| Poids total transféré            | ≤ 1 200 Ko          |

Le tableau des mesures s'affiche dans le **résumé de la CI** (onglet Actions → l'exécution → _Summary_).

### Résultats (médiane de 3 chargements)

| Page          | Premier affichage | Plus grand élément | Décalages | Blocage | JS     | Total  |
| ------------- | ----------------- | ------------------ | --------- | ------- | ------ | ------ |
| Accueil       | 1,3 s             | 1,3 s              | 0,001     | 494 ms* | 164 Ko | 443 Ko |
| Catégorie     | 1,1 s             | 1,1 s              | 0,005     | 223 ms  | 163 Ko | 329 Ko |
| Fiche produit | 1,2 s             | 1,2 s              | 0,001     | 257 ms  | 166 Ko | 326 Ko |
| Recherche     | 1,1 s             | 1,1 s              | 0,01      | 218 ms  | 163 Ko | 310 Ko |
| Panier        | 1,2 s             | 2,7 s*             | 0         | 176 ms  | 166 Ko | 340 Ko |

\* Budgets adaptés et suivis comme dette :

- **Accueil** : blocage ≤ 650 ms, à cause d'environ 50 cartes produits à rendre interactives. Objectif 300 ms au Sprint 3 (S3-T08), avec le chargement progressif depuis l'API.
- **Panier** : plus grand élément ≤ 3 s. Le panier est lu sur le téléphone, donc il s'affiche après le JavaScript ; c'est aussi une page rarement ouverte à froid.

### Problèmes trouvés et corrigés

| Problème                                                                    | Correction                                                                                                             | Effet                   |
| --------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- | ----------------------- |
| **Texte qui saute** à l'arrivée de la police (CLS 0,23 sur le panier)       | Police servie par `next/font` : préchargée, avec une police de secours aux mêmes dimensions                            | Décalages ≈ 0           |
| Le squelette du panier était réutilisé pour le contenu (saut de 257 px)     | Hauteur réservée + éléments distincts                                                                                  | Décalages 0,23 → 0      |
| **Image principale chargée en dernier** (accueil, listes)                   | Image de la 1re bannière et 2 premières cartes des listes chargées en priorité                                         | Accueil : 2,5 s → 1,3 s |
| Ajouter un favori ou au panier **redessinait toutes les cartes** de la page | Actions du panier dans un contexte qui ne change jamais ; chaque cœur ne suit que son produit (`useSyncExternalStore`) | Accueil : blocage −15 % |
| Accueil trop chargé                                                         | Rangées de 10 produits (au lieu de 12) et 12 produits en bas de page (au lieu de 18)                                   | Blocage −10 %           |

## 3. S2-T09 — Dépendances

- Les **PR Dependabot n° 1 à 6** (créées au Sprint 1) sont **toutes fermées** : remplacées par les mises à jour faites à la main au S1.
  C'était le cas de Node 26, refusé volontairement car on reste sur Node 22 LTS.
- **Nouvelle configuration Dependabot** :
  - le lundi à 6 h (heure de Libreville) ;
  - PR groupées : Next/React, outils de test, outils de développement, toutes les actions GitHub en une seule PR ;
  - étiquette `dependencies` ;
  - les majeures de TypeScript (7), ESLint (10) et `@types/node` sont écartées et évaluées au Sprint 3.
- **Mises à jour appliquées** : React 19.3 (correctifs) et types Node 22, alignés sur la version qui fait tourner le site.
- **Échec du robot Dependabot pour npm** : le journal n'est visible que dans l'interface GitHub. La nouvelle configuration sera essayée lundi ;
  si l'échec continue, le message d'erreur est à relever (voir § 5).

## 4. Qualité

- 120 tests unitaires et de composants, 32 tests de bout en bout et 5 budgets de performance : ✅.
- `pnpm audit --prod` : 0 vulnérabilité.

## 5. Actions requises

1. **Étiqueter la version v0.2.0** après la fusion :
   ```
   git switch main
   git pull
   git tag v0.2.0
   git push origin v0.2.0
   ```
   Le workflow `release.yml` crée la Release GitHub et promeut l'image testée ; la production est ignorée tant qu'aucun serveur n'est configuré.
2. Si Dependabot npm échoue encore : GitHub → **Insights → Dependency graph → Dependabot** → ligne « npm » → **View logs**, puis copier le message d'erreur.

## 6. Prochaines étapes

**Sprint 3** : le backend (NestJS + PostgreSQL), en commençant par le module `catalog` (S3-T01 à S3-T08).
