# Rapport — S6-T01 : fondations du module `vendors` (boutiques des vendeurs)

|                                                 |                                                                    |
| ----------------------------------------------- | ------------------------------------------------------------------ |
| **Date**                                        | 2026-10-15                                                         |
| **Sprint / tâches**                             | S6 — S6-T01                                                        |
| **Version**                                     | v0.5.0 (versions des paquets inchangées) ; contrat de l'API 1.14.0 |
| **Sections du cahier d'architecture modifiées** | §3.3, §3.5, §3.7, §3.10, §3.16 (nouvelle), §6.4 — version 3.8      |

## 1. Résumé

Kemdia a maintenant des **boutiques de vendeurs**. Un client connecté demande à ouvrir sa boutique ; un administrateur la
**valide** (le compte reçoit le rôle vendeur), la **refuse** (avec un motif montré au demandeur, qui peut redemander) ou la
**suspend** (le rôle est retiré). Les produits déjà au catalogue appartiennent à une boutique **« Kemdia »** interne. C'est la base
du reste du Sprint 6 : KYC, produits des vendeurs et leur modération, commandes vendeur, commissions. Tout passe par l'API pour
l'instant (ton choix : le site sera branché dans une tâche dédiée).

```
Client connecté ──POST /vendors/shop──► boutique « en attente » ──► file de l'administration (GET /admin/shops)
                                                                       │
              ┌──────── valider : rôle vendeur accordé ◄───────────────┼──► refuser (motif) ──► nouvelle demande
              ▼                                                        │
         « active » ──suspendre (motif) : rôle retiré──► « suspendue » ─┘ (valider = réactiver)
```

## 2. Fonctionnalités livrées

| Élément                  | Ce que ça fait                                                                                                                           | Fichiers principaux                                                    |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| Demande de boutique      | `POST /api/v1/vendors/shop` : nom, ville, mobile gabonais, description ; une boutique par compte ; nouvelle demande possible après refus | `vendors/domain/shop.ts`, `vendors/application/shop.service.ts`        |
| Suivi par le demandeur   | `GET /api/v1/vendors/shop` : statut et motif (jamais qui a examiné)                                                                      | `vendors/interface/shop.controller.ts`                                 |
| File de l'administration | `GET /api/v1/admin/shops` (plus ancienne d'abord, filtre par statut, pages), `GET …/{id}`                                                | `vendors/interface/admin-shop.controller.ts`                           |
| Décisions                | `POST …/{id}/approve`, `…/reject`, `…/suspend` : boutique + rôle vendeur + journal d'audit dans une seule transaction                    | `shop.service.ts`, `identity` (`RoleService` exporté)                  |
| Boutique Kemdia          | Créée par la migration (identifiant fixe) ; tous les produits existants et importés lui appartiennent (`catalog.products.shop_id`)       | `prisma/migrations/20261015210000_boutiques`, `prisma/schema/*.prisma` |
| Contrat                  | Schémas `Shop*`, constantes `SHOP_*`, `KEMDIA_SHOP_ID`, codes d'erreur des boutiques ; OpenAPI 1.14.0                                    | `packages/contracts`, `docs/api/openapi.json`                          |

## 3. Décisions techniques

[ADR-0032](../architecture/adr/0032-boutiques-vendeurs.md), avec tes choix du 2026-10-15 : **fondations d'abord**, **demande +
validation par un administrateur**, **boutique Kemdia interne** pour les produits actuels, **API seule**, **demande minimum**.

- **Commission (question ouverte n° 3)** : toujours sans réponse du client ; **rien n'est inventé**. Ce S6-T01 n'en dépend pas ; le
  réglage des taux viendra avec la tâche des commissions (noté dans `regles-metier.md`).
- Une boutique a 4 statuts (`pending`, `active`, `rejected`, `suspended`). Le nom refusé est **libéré** (un autre demandeur, par
  exemple la vraie entreprise, peut le prendre).
- Le module `vendors` passe par le port public `RoleService` du module identity : la décision et le rôle sont écrits ensemble ou
  pas du tout.
- Migration **d'ajout seul** : la version précédente de l'API continue de fonctionner (nouvelle colonne `shop_id` avec la boutique
  Kemdia par défaut).

## 4. Sécurité

- **Accès** : administration réservée aux administrateurs connectés depuis moins de 15 minutes, 30 requêtes par minute ; le
  demandeur ne lit que **sa** boutique (aucun identifiant accepté) ; 5 demandes par minute par compte.
- **Personne ne décide pour sa propre boutique**, vérifié à trois niveaux (domaine, `RoleService`, contrainte SQL), identifiant en
  majuscules compris.
- **Pas d'usurpation de nom** : lettres ASCII et accentuées du français seulement, caractères invisibles retirés, signes
  ressemblants confondus pour l'unicité (« Chez A1i » = « Chez Ali »), « Kemdia » interdit même déguisé.
- **Pas de doublon** : verrou par compte pour deux envois simultanés ; verrou de la boutique pour deux décisions simultanées.
- **Base** : contraintes CHECK qui doublent les règles (boutique Kemdia unique et toujours active, mobile gabonais, motif ⇔ refus
  ou suspension, examinateur ≠ propriétaire…).
- **Journal d'audit** : chaque demande (`shop.requested`, avec l'ancien nom) et chaque décision (avec le motif).

**Relecture de sécurité indépendante** (agent séparé, avant la PR) : **aucun problème critique ni élevé**. Corrigé :

| Gravité        | Trouvé                                                                                                       | Correction                                                                                                                            |
| -------------- | ------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------- |
| Moyen          | « ᴋᴇᴍᴅɪᴀ Officiel », « Kemdıa », « KEMDlA », « Kemd1a » acceptés : imitation de Kemdia ou d'un autre vendeur | Lettres ASCII et accentuées du français seulement ; clé d'unicité qui confond l/1/i et 0/o ; « Kemdia » cherché sur cette clé ; tests |
| Moyen          | Un nom refusé restait bloqué pour toujours (la vraie entreprise ne pouvait plus le prendre)                  | Clé du nom vidée au refus (contrainte SQL « clé vide ⇔ refusée ») ; test d'intégration                                                |
| Faible à moyen | Motif d'une décision et anciennes demandes perdus (effacés par la décision ou la demande suivante)           | Motif inscrit au journal (100 caractères) ; nouvelle action `shop.requested` avec l'ancien nom                                        |
| Faible         | Après une nouvelle demande, la boutique « en attente » semblait déjà examinée                                | Examinateur et date remis à vide                                                                                                      |
| Faible         | Ville en texte libre (`<script>` accepté)                                                                    | Ville limitée aux lettres, chiffres et ponctuation simple                                                                             |

**Gardé et noté** (ADR-0032) : pendant une décision, `RoleService` relit le compte hors de la transaction (deux connexions un court
instant ; il faudrait 10 décisions simultanées pour gêner, et tout se rétablit seul) ; la description reste du texte libre (le site
devra l'afficher échappée, ce que React fait par défaut) ; le mobile de contact sera vérifié avec le KYC ; un administrateur peut
encore changer le rôle vendeur par les routes des rôles (S4-T06) : les routes des vendeurs vérifieront **le rôle ET une boutique
active**.

J'ai aussi changé l'index unique partiel prévu pour la boutique Kemdia en contrainte CHECK : Prisma ne décrit pas les index
partiels, et ta comparaison `db:check` l'aurait signalé comme un écart.

## 5. Qualité

GitHub Actions étant bloqué, tout a été lancé **en local** (espace de travail cloud, PostgreSQL 16, base `kemdia_test`) :

| Vérification                           | Résultat                                                                                      |
| -------------------------------------- | --------------------------------------------------------------------------------------------- |
| Format, lint, types (tout le dépôt)    | ✅                                                                                            |
| Construction de l'API et du site       | ✅ (site construit avec une API **injoignable**, comme en CI)                                 |
| Tests unitaires de l'API               | ✅ **467** (432 avant ; +35 : domaine, cas d'utilisation, alignement contrat ↔ domaine ↔ SQL) |
| Tests d'intégration (vraie base)       | ✅ **153** (143 avant ; +10 : `vendors.int.test.ts`)                                          |
| Tests du site / du contrat             | ✅ 280 / 28 (+3 sur les boutiques)                                                            |
| Bout en bout (Playwright)              | Non relancés : le site n'a pas changé                                                         |
| Gitleaks v8.30.1 (empreinte vérifiée)  | ✅ sur l'historique de la branche (voir la PR)                                                |
| `db:check` (migration ↔ schéma Prisma) | ⏳ **à lancer chez toi** (le moteur Prisma ne se télécharge pas ici)                          |

**Test instable corrigé au passage** (hors boutiques) : `payments/domain/webhook-signature.test.ts` échouait une fois sur 16 — il
« abîmait » la signature en mettant « 0 » en tête, ce qui ne changeait rien quand elle commençait déjà par « 0 ». Il change
maintenant toujours ce caractère (40 passages d'affilée sans échec). Le code des paiements n'est pas touché.

Dans l'espace cloud, le client Prisma a été généré avec un moteur factice et les migrations appliquées avec `psql` dans l'ordre.

## 6. Captures d'écran

Aucune : pas de changement visible sur le site (API seule).

**Correctif du 2026-10-16** (branche `fix/S6-db-check-shop-id`) : `db:check` signalait un écart (code 2) sur la valeur par
défaut de `catalog.products.shop_id`. PostgreSQL la garde sous la forme `'6b656d64-…'::uuid`, que Prisma ne reconnaît pas comme
le texte `@default("…")` du schéma (et la réécrire n'y changeait rien). Le schéma Prisma utilise maintenant
`@default(dbgenerated("'…'::uuid"))`, la forme exacte de la base : **aucune migration, aucun changement de la base**. Vérifié
avec le moteur de schéma de Prisma : « No difference detected » sur une base construite avec toutes les migrations.

## 7. Limites connues / dette technique

- Pas encore d'écran (demande sur `/vendre`, espace vendeur, back-office) ni d'e-mail au demandeur à la décision.
- Comptes qui avaient déjà le rôle vendeur (accordé à la main au S4-T06) : sans boutique ; à traiter par la règle « rôle ET
  boutique active ».
- Commission : en attente du client (question n° 3).

## 8. Prochaines étapes

1. **Toi, avant de fusionner** : `pnpm --filter @kemdia/api db:check` sur ta base de développement (port 5433), puis
   `pnpm --filter @kemdia/api db:migrate` si besoin.
2. Suite du S6 (à choisir ensemble) : KYC (BR-024), produits des vendeurs et modération (BR-003), branchement du site (`/vendre`
   et espace vendeur), commandes vendeur (BR-013), commissions (BR-020, question n° 3), double authentification admin (MED-15).
3. La démo Render ne se met plus à jour seule : rien de visible à montrer ici, sinon `en-ligne.ps1`.
