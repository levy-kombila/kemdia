# ADR-0032 — Boutiques des vendeurs (fondations du module `vendors`)

- **Statut** : Accepté
- **Date** : 2026-10-15
- **Tâche** : S6-T01
- **Complète** : [ADR-0006](0006-monolithe-modulaire-7-modules.md) (modules), [ADR-0020](0020-roles-journal-audit.md) (rôles, journal d'audit)

## Contexte

Le Sprint 6 ouvre Kemdia aux **vendeurs tiers** (boutiques, KYC BR-024, modération des produits BR-003, commandes vendeur
BR-013, commissions BR-020). Avant lui, le rôle `vendor` existait (S4-T06) mais rien ne le reliait à une boutique, et les
produits du catalogue n'appartenaient à personne. Cette première tâche pose les fondations sur lesquelles les suivantes
s'appuieront.

Choix du propriétaire (2026-10-15) :

| Question                        | Choix                                                                                                           |
| ------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| Contenu du S6-T01               | **Fondations** : boutique, demande, validation par l'administration, rôle vendeur, produits liés à une boutique |
| Comment devient-on vendeur      | **Demande depuis un compte connecté + validation par un administrateur**                                        |
| Produits déjà au catalogue      | **Boutique « Kemdia » interne**, sans commission ni validation préalable                                        |
| Commission (question ouverte 3) | **Pas encore de réponse du client** : rien d'inventé ici ; réglage prévu dans une tâche suivante                |
| Site                            | **API seule** (le site sera branché dans une tâche dédiée du S6)                                                |
| Informations demandées          | **Minimum** : nom, ville, mobile de contact, description (pièces et compte de versement : avec le KYC)          |

## Décision

| Sujet                   | Choix                                                                                                                                                                                                                                                                                                                                                                                                | Raison                                                                                           |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| Où                      | Nouveau module `vendors`, schéma PostgreSQL `vendors`, table `shops` ; colonne `catalog.products.shop_id` (UUID, **sans relation** entre modules)                                                                                                                                                                                                                                                    | Un schéma par module (ADR-0008) ; le catalogue reste indépendant                                 |
| Boutique Kemdia         | Ligne créée par la migration, identifiant fixe `KEMDIA_SHOP_ID` (« kemdia » en hexadécimal) ; `shop_id` vaut cet identifiant **par défaut** : produits existants, import de la démo et graines n'ont rien à changer                                                                                                                                                                                  | Migration d'ajout, compatible avec l'API précédente                                              |
| Une boutique par compte | Index unique sur le propriétaire ; deux envois simultanés sérialisés par un **verrou consultatif** par compte (`pg_advisory_xact_lock`)                                                                                                                                                                                                                                                              | Pas de doublon même quand aucune ligne n'existe encore à verrouiller                             |
| Cycle de vie            | `pending` → `active` (valider) ou `rejected` (refuser, motif ; **le nom est libéré**) ; `active` → `suspended` (suspendre, motif) ; `suspended` → `active` (réactiver) ; `rejected` → `pending` (nouvelle demande du demandeur, qui n'est alors plus « examinée »)                                                                                                                                   | Simple, réversible, motif toujours montré au vendeur                                             |
| Rôle vendeur            | Valider **accorde** `vendor`, suspendre le **retire**, par `RoleService` du module identity ; boutique, rôle et journal d'audit dans **une seule transaction** (le `run` imbriqué rejoint celle en cours)                                                                                                                                                                                            | Jamais un vendeur sans boutique validée, ni l'inverse, après une décision                        |
| Garde-fous              | Personne ne décide pour sa propre boutique (domaine + `RoleService` + contrainte SQL) ; compte du vendeur fermé → `PROPRIETAIRE_INACTIF`, rien n'est écrit ; boutique Kemdia jamais concernée                                                                                                                                                                                                        | Mêmes règles que les rôles (ADR-0020), vérifiées à trois niveaux                                 |
| Nom                     | Nettoyé (espaces, caractères invisibles et de contrôle retirés) ; **lettres ASCII et accentuées du français**, chiffres et ponctuation simple (ni lettres d'autres alphabets, ni « ı », « ᴋ », « ɑ »…) ; **clé d'unicité** sans casse, accents ni ponctuation, signes ressemblants confondus (« l », « 1 » → « i » ; « 0 » → « o ») ; **« Kemdia » interdit**, même déguisé (« KEMDlA », « Kemd1a ») | On ne se fait pas passer pour une autre boutique, ni pour Kemdia (lettres cyrilliques comprises) |
| Adresse lisible         | Tirée de la clé du nom (« chez-ali ») ; en cas de doublon, suffixe de 4 caractères au hasard                                                                                                                                                                                                                                                                                                         | Prête pour la future page publique de la boutique                                                |
| Administration          | `GET /api/v1/admin/shops` (file : demande la plus ancienne d'abord, filtre par statut), `GET …/{id}`, `POST …/{id}/approve`, `…/reject`, `…/suspend` ; administrateur connecté depuis < 15 min, 30 requêtes/min ; journal : `shop.requested` (chaque demande, avec l'ancien nom), `shop.approved`, `shop.rejected`, `shop.suspended` (motif gardé, 100 caractères) + `role.granted` / `role.revoked` | Mêmes protections que les coupons et les rôles                                                   |
| Demandeur               | `POST /api/v1/vendors/shop` (5 par minute et par compte), `GET /api/v1/vendors/shop` ; le demandeur ne voit jamais qui a examiné sa boutique                                                                                                                                                                                                                                                         | Compte connecté (donc vérifié, BR-041)                                                           |
| Base de données         | Contraintes CHECK : boutique Kemdia = identifiant imposé (donc une seule), sans propriétaire, active ; vendeur avec propriétaire et mobile gabonais ; longueurs ; motif ⇔ refus ou suspension ; clé du nom vide ⇔ refusée ; examinateur ≠ propriétaire. **Aucun index partiel** (Prisma ne les décrit pas : `db:check` les signalerait)                                                              | Même un bogue ne peut pas écrire une boutique incohérente                                        |
| Contrat                 | 1.14.0 : schémas `Shop`, `AdminShop`, `AdminShopPage`, `ShopApplicationRequest`, `ShopDecisionReason` ; `SHOP_STATUSES`, `SHOP_LIMITS`, `KEMDIA_SHOP_ID`, `VENDOR_ERROR_CODES` ; cible `shop` au journal d'audit                                                                                                                                                                                     | Le site (tâche suivante) affichera la demande et sa décision                                     |

## Options écartées

- **Boutique créée par l'administrateur seulement** : plus simple, mais chaque vendeur partenaire devrait tout transmettre hors du site ; écarté par le propriétaire.
- **Ouverture immédiate sans validation** : un compte frauduleux deviendrait vendeur aussitôt ; écarté par le propriétaire.
- **Relation SQL entre `catalog.products` et `vendors.shops`** : interdit entre modules (ADR-0006) ; l'existence de la boutique sera vérifiée par le cas d'utilisation qui crée un produit de vendeur (S6).
- **Plusieurs boutiques par compte** : rien ne le demande au MVP ; une seule boutique simplifie le KYC, les versements et les commissions.
- **Commission saisie dès maintenant avec un taux supposé** : la question n° 3 n'est pas tranchée ; rien n'est inventé.

## Conséquences

- ➕ Un client peut demander à vendre ; l'administration a une file à examiner, avec une trace de chaque décision.
- ➕ Chaque produit a une boutique : le catalogue est prêt pour les produits des vendeurs (modération BR-003) et les commandes vendeur (BR-013).
- ➖ Un administrateur peut encore retirer ou accorder le rôle `vendor` directement (routes des rôles, S4-T06) sans toucher à la boutique : les routes des vendeurs (tâches suivantes) vérifieront **le rôle ET une boutique active**.
- ➖ Pas encore d'écran : tout passe par l'API (site et back-office plus tard au S6).
- ➖ Pas de notification au demandeur (e-mail) à la décision : à ajouter avec le branchement du site.
- ➖ Pendant une décision, `RoleService` relit le compte hors de la transaction : une décision occupe deux connexions un court instant. Sans effet pratique (il faudrait autant de décisions simultanées que de connexions, 10) ; à revoir si le dépôt des comptes passe par `TransactionContext`.
- ➖ La ville et la description sont du texte libre (caractères invisibles retirés, ville limitée aux lettres, chiffres et ponctuation simple) : le site devra les afficher échappées (React le fait par défaut). Le mobile de contact sera vérifié avec le KYC.
