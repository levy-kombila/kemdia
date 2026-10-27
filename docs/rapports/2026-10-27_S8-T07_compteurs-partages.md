# Rapport — S8-T07 : compteurs de l'API déplacés en base, avant plusieurs instances

|                                                 |                                                                 |
| ----------------------------------------------- | --------------------------------------------------------------- |
| **Date**                                        | 2026-10-27                                                      |
| **Sprint / tâches**                             | S8 — S8-T07 (dette S7.5)                                        |
| **Version**                                     | v0.8.1 → (v0.9.x à la clôture du S8) ; contrat 2.7.0 (inchangé) |
| **Sections du cahier d'architecture modifiées** | §3.38 (nouvelle), §3.7 « Limitation de débit » — version 4.34   |

## 1. Résumé

Les limites de sécurité de l'API comptaient dans la mémoire de chaque processus. Avec deux instances, chaque limite
aurait été multipliée par deux. Elles comptent maintenant dans une **table partagée** de PostgreSQL :

```
Avant (mémoire)          : instance A 10/min  +  instance B 10/min  = 20 appels acceptés
Après (platform.rate_counters) : A et B lisent le même compteur        = 10 appels, le 11e refusé (429)
```

Si la base ne répond pas, chaque instance continue comme avant (compteurs en mémoire) au lieu de tomber en panne.

## 2. Fonctionnalités livrées

| Élément             | Ce qui change                                                                                                   | Où                                                                       |
| ------------------- | --------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| Base                | Schéma `platform`, table `rate_counters` (clé, appels, fin de fenêtre, fin de blocage)                          | `platform.prisma`, migration `20261027120000_compteurs_partages`         |
| Compteurs           | Comptage en **une requête atomique** ; lecture, annulation, ménage ; version mémoire identique                  | `src/database/rate-counters.ts`                                          |
| Repli               | Base en panne ou plus lente que 500 ms : compteurs en mémoire, avertissement (1/min, sans valeur)               | `FallbackRateCounters`                                                   |
| Limites de débit    | Stockage de `@nestjs/throttler` (adresse et compte) sur les compteurs partagés                                  | `src/http/rate-limit.ts`, `app.module.ts`                                |
| Coupons             | Essai réservé avant la vérification, annulé si ce n'est pas un refus de coupon                                  | `orders/application/order.service.ts`                                    |
| Renvois de factures | 1 par facture en 10 min, 5 par client et par heure, réservés de façon atomique                                  | `payments/application/finance.service.ts`                                |
| Recherche           | Budget de 120 corrections par minute commun à toutes les instances                                              | `catalog/application/catalog.service.ts`                                 |
| Ménage              | Compteurs terminés effacés toutes les 10 minutes                                                                | `src/database/rate-counters-cleanup.ts`                                  |
| Réglage             | `RATE_LIMIT_STORE` : `database` par défaut hors tests, `memory` refusé en production                            | `src/config/env.ts`                                                      |
| Tests               | 12 tests unitaires (compteurs, limites, repli, réglage), 4 tests d'intégration dont **deux instances** de l'API | `rate-counters.test.ts`, `env.test.ts`, `test/rate-counters.int.test.ts` |

Aucun changement de l'API ni du site.

## 3. Décisions techniques

Choix du 2026-10-27 : options recommandées retenues sans t'être reposées.

- **PostgreSQL** plutôt que Redis : pas de service de plus à payer tant que la location du serveur attend le client ;
- **fenêtre fixe** (une ligne par clé) plutôt que glissante (une ligne par appel) : beaucoup moins d'écritures ;
- table **ordinaire** (pas `UNLOGGED`) : un blocage survit à un redémarrage, et `db:check` sait la comparer ;
- **repli en mémoire** plutôt qu'une panne : une table absente (avant `db:deploy`) ou une base lente ne coupe pas
  l'API ; la clé bloquée par la base n'est plus écrite jusqu'à la fin du blocage ;
- schéma **`platform`** pour l'état partagé hors modules métier ; chaque module le voit comme son propre port
  (`SharedCounters`) branché dans sa couche infrastructure (règles d'architecture respectées) ;
- caches de lecture **gardés en mémoire** (rayons 60 s, corrections 30 s) : ils ne font que gagner du temps.

Décision complète : [ADR-0064](../architecture/adr/0064-compteurs-partages-en-base.md).

## 4. Sécurité

### Relecture indépendante (agent séparé, avant la PR) : 0 critique, 1 haute, 3 moyennes, 4 basses, 2 infos

| Problème relevé                                                                                               | Correction                                                                                              |
| ------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| Haute : une écriture en base par requête, même déjà bloquée ; attente d'une connexion jusqu'à 5 s sous charge | Clé bloquée plus écrite jusqu'à la fin du blocage (testé) ; repli si la base dépasse **500 ms** (testé) |
| Moyenne : coupons vérifiés puis comptés : des essais simultanés passaient tous                                | Essai **réservé avant** la vérification, annulé s'il n'est pas un refus                                 |
| Moyenne : fenêtre fixe au lieu de glissante pour coupons et renvois (2× la limite à la frontière)             | **Accepté** (ADR) : limites de débit déjà à fenêtre fixe ; reste une forte protection                   |
| Moyenne : comptage sur une 2e connexion pendant une transaction de commande                                   | **Accepté** (ADR), atténué par le délai de 500 ms et le repli                                           |
| Basse : `RATE_LIMIT_STORE=memory` accepté en production                                                       | **Refusé en production** (testé)                                                                        |
| Basse : repli visible seulement dans le journal                                                               | **Accepté** (ADR)                                                                                       |
| Basse : horloge de chaque instance                                                                            | **Accepté** (ADR) : quelques secondes d'écart sur une fenêtre d'une minute                              |
| Basse : un renvoi peut rester bloqué 10 min après un échec simultané                                          | **Accepté** (ADR) : bloque, ne laisse rien passer                                                       |
| Info : UUID du compte dans certaines clés                                                                     | **Accepté** (ADR) : pseudonyme, ligne effacée 10 min après sa fin ; l'adresse IP est déjà une empreinte |
| Info : tests de coupons en parallèle, repli, annulation en base                                               | Repli et annulation en base testés ; coupons simultanés couverts par la réservation atomique            |

Sans problème selon la relecture : requête de comptage atomique et juste (valeurs « avant » dans `SET`, blocage, fin
de blocage) ; requêtes paramétrées et clés bornées ; journal sans valeur ; ménage sans risque entre instances ;
valeur par défaut `database` hors tests ; règles d'architecture respectées.

## 5. Qualité

- Format et lint sur tout le dépôt, typecheck et build : ✓.
- Tests unitaires : API **669** ✓ (+12), site **501** ✓, contrat **34** ✓.
- Intégration sur une base PostgreSQL neuve : **260** ✓ (+4, dont 40 comptages simultanés et deux instances).
- `pnpm audit --audit-level high --prod` : aucune faille haute ou critique (1 moyenne, sous le seuil) ; Gitleaks
  v8.30.1 ✓ ; `db:check`, bout en bout, performance, Semgrep, CodeQL et ZAP : par la CI.

## 6. Captures d'écran

Sans objet (aucun changement visible) ; la preuve est le test d'intégration « deux instances de l'API ».

## 7. Limites connues / dette technique

- Pendant une panne de la base, les limites redeviennent par instance (repli), visible seulement dans le journal.
- Si la charge sur PostgreSQL devient trop forte, passer les compteurs sur Redis ou sur un pool de connexions à part.

## 8. Prochaines étapes

- **Migration** : après la fusion, lancer `db:deploy` puis `db:check` sur la démo (schéma `platform`). Avant, l'API
  tourne en repli (comme aujourd'hui), avec un avertissement par minute dans son journal.
- Après la fusion, attendre « Déploiement DÉMO (Render) ».
- Puis la clôture du S8, quand les réponses du client seront complétées.
