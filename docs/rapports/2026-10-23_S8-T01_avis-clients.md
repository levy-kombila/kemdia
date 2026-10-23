# Rapport — S8-T01 : avis des clients

|                                                 |                                                      |
| ----------------------------------------------- | ---------------------------------------------------- |
| **Date**                                        | 2026-10-23                                           |
| **Sprint / tâches**                             | S8 — S8-T01                                          |
| **Version**                                     | v0.8.1 → (v0.9.x à la clôture du S8) ; contrat 2.5.0 |
| **Sections du cahier d'architecture modifiées** | §3.30 (nouvelle) — version 4.26                      |

## 1. Résumé

Les clients peuvent maintenant **noter et commenter** les produits qu'ils ont reçus (exigence FR-020) :

- **Seul un client livré** peut donner son avis (une commande « livrée » qui contient ce produit) : pas de faux avis ;
- **Une note seule** (1 à 5 étoiles) est **publiée tout de suite** ; **un commentaire** attend la relecture de l'équipe
  Catalogue, qui le **publie** ou le **refuse avec un motif** montré au client ;
- **Un avis par produit et par client**, modifiable et retirable ; l'auteur apparaît en « **Awa N.** » avec la mention
  « **Achat vérifié** » ;
- La **note et le nombre d'avis** de la fiche viennent maintenant des **vrais avis** publiés ;
- Les avis sont dans la **copie des données** du client et **effacés avec son compte**.

```
Fiche produit — Avis clients
  ★★★★☆ 4,2 sur 5 (12 avis)     5 ★ ████████ 7     Votre avis : ☆☆☆☆☆  [ commentaire facultatif ]
                                4 ★ ███ 2                       [ Envoyer ]
  Awa N. · Achat vérifié · ★★★★★ « Tissu de qualité, couleurs fidèles. »
Équipe — /equipe/avis
  « Arrivé abîmé… » — Bob K. · 1 ★     [ Publier ]   [ Motif du refus…  ] [ Refuser ]
```

## 2. Fonctionnalités livrées

| Élément         | Ce qui change                                                                                                         | Où                                                     |
| --------------- | --------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------ |
| Base            | Schéma `reviews`, table `reviews.reviews` (un avis par fiche et par compte, contraintes de la base)                   | migration `20261023200000_avis_clients`                |
| Module API      | Nouveau module `reviews` (domaine, service, dépôt Prisma, contrôleurs), achat vérifié par les ports de catalog/orders | `apps/api/src/modules/reviews`                         |
| Routes          | `GET /products/{slug}/reviews` ; `GET/PUT/DELETE …/reviews/mine` ; `GET /admin/reviews`, `POST …/publish`, `…/reject` | `review.controller.ts`, `reviews.openapi.ts`           |
| Note des fiches | Recalculée depuis les avis publiés, dans la même transaction que chaque changement                                    | `listing-ratings.ts`, `review.service.ts`              |
| Journal         | `review.published`, `review.rejected` (cible « avis »)                                                                | `audit-event.ts`, contrat                              |
| Données perso.  | `avis` dans la copie ; effacement avec le compte, notes recalculées                                                   | `reviews-personal-data.ts`                             |
| Site            | Section « Avis clients » de la fiche (moyenne, répartition, pages, formulaire), page de l'équipe `/equipe/avis`       | `components/reviews`, `app/equipe/avis`, `lib/reviews` |
| Contrat         | Schémas des avis, codes `ACHAT_REQUIS`, `AVIS_*`, limites ; version **2.5.0**                                         | `packages/contracts`, `docs/api/openapi.json`          |

## 3. Décisions techniques

Choix du 2026-10-23 : à ta demande, les **options recommandées** sont retenues sans t'être reposées. Les voici, pour
validation à la lecture de la PR : avis **réservés aux clients livrés** ; **note seule publiée tout de suite**,
**commentaire relu** par l'équipe Catalogue ; **prénom et initiale** de l'auteur ; **un avis par produit et par
client** (modifiable) ; avis **effacés avec le compte** ; 10 avis par page.

- **Module séparé `reviews`** : il lit la fiche et les commandes livrées par leurs portes publiques, jamais leurs tables.
- **Modifier un avis le soumet de nouveau** à l'équipe s'il a un commentaire.
- **Nom affiché figé** à l'écriture (« Awa N. ») : jamais le nom complet ni l'identifiant du compte.
- **Fiches de démonstration** : elles gardent leurs notes tant qu'aucun avis réel ne les remplace.
- Décision complète : [ADR-0056](../architecture/adr/0056-avis-clients.md).

## 4. Sécurité

### Relecture indépendante (agent séparé, avant la PR) : 0 haute, 2 moyennes, 3 basses, 4 infos

| Problème relevé                                                                                                 | Correction                                                                                                                                               |
| --------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Moyenne : l'équipe pouvait publier un texte qu'elle n'avait pas lu (l'auteur le modifie pendant la relecture)   | Publier et refuser envoient la **version lue** (champ caché) ; si l'avis a changé : refus `AVIS_MODIFIE` et message « relisez le nouveau texte » ; testé |
| Moyenne : deux avis envoyés au même moment sur une fiche pouvaient faire perdre une note (recalculs simultanés) | La **fiche est verrouillée** avant chaque changement d'avis et son recalcul (écriture, retrait, décision, effacement) ; ordre fiche puis avis            |
| Basse : la fusion de deux fiches laissait les avis sur l'ancienne fiche (invisibles, note de la cible fausse)   | Les avis **suivent la fusion** (le plus récent d'un même client reste), notes des deux fiches recalculées dans la même transaction ; testé               |
| Basse : un client ne pouvait plus retirer son avis quand la fiche n'était plus en ligne                         | « Mon avis » et le retrait trouvent la fiche **quel que soit son état** ; la modification reste réservée aux fiches en ligne ; testé                     |
| Basse : la mémoire des avis du site pouvait être remplie avec des numéros de page inventés                      | Une page n'est gardée que si l'API a servi **la page demandée** (une page au-delà de la dernière n'est jamais gardée)                                    |
| Info : le liant sans chasse était retiré des commentaires (émojis composés cassés)                              | Gardé (seul caractère invisible conservé)                                                                                                                |
| Info : un motif de refus recopié au journal pourrait contenir une donnée personnelle                            | Rappel dans le champ : « sans donnée personnelle »                                                                                                       |
| Info : un curseur de la file mal formé ramène au début de la liste                                              | Accepté : sans danger (lecture réservée à l'équipe)                                                                                                      |
| Info : le prénom est affiché tel que saisi à l'inscription                                                      | Accepté : seulement le prénom et l'initiale, figés à l'écriture                                                                                          |

Sans problème selon la relecture : impossible d'écrire l'avis d'un autre (session seule, corps strict) ; achat livré
vérifié côté API ; aucun identifiant de compte dans les réponses publiques ; textes affichés échappés par React ;
file et décisions réservées au rôle Catalogue avec double authentification ; requêtes SQL paramétrées ; limites
(10 écritures par minute et par compte) ; contraintes de la base qui doublent les règles du domaine ; effacement
complet avec le compte.

## 5. Qualité

- Format et lint sur tout le dépôt, typecheck et build : ✓.
- API : **633 tests unitaires** ✓, dont règles des avis (note, commentaire, nom affiché, modération, version lue,
  moyenne) et service (achat requis, recalculs, verrou de la fiche).
- API : **244 tests d'intégration** sur une vraie base neuve ✓, dont `reviews.int.test.ts` (achat livré, note seule
  publiée, modération tracée, version lue `AVIS_MODIFIE`, fiche retirée de la vente, effacement et copie) et la fusion
  de fiches (`listings.int.test.ts` : avis déplacés, doublon d'un même client, note recalculée).
- Site : **488 tests** ✓ ; contrat : **34 tests** ✓ ; description OpenAPI régénérée (contrat 2.5.0).
- Bout en bout (CI) : section « Avis clients » de la fiche et page `/equipe/avis`, accessibilité.
- Migration appliquée sur une base neuve avec toutes les précédentes.
- Gitleaks v8.30.1 ✓ ; Semgrep, Playwright, CodeQL et ZAP : par la CI.

## 6. Captures d'écran

Les pages sont parcourues par les tests de bout en bout de la CI et seront visibles sur la démo après le déploiement.

## 7. Limites connues / dette technique

- Pas encore de **réponse du vendeur**, de **signalement** d'un avis par les clients, ni de **photos** dans les avis.
- Pas d'**e-mail** au client quand son commentaire est publié ou refusé (il le voit sur la fiche).
- Les **fiches de démonstration** gardent leurs notes inventées tant qu'aucun avis réel n'existe.

## 8. Prochaines étapes

- Après la fusion : `pnpm --filter @kemdia/api db:deploy`, puis `db:check` (nouveau schéma `reviews`) ; attendre
  « Déploiement DÉMO (Render) ».
- S8-T02 proposée : bêta sur invitation et bouton « Signaler un problème ».
