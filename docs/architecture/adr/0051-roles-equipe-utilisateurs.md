# ADR-0051 — Rôles détaillés de l'équipe, écran Utilisateurs et avis « nouvel appareil »

- **Statut** : Accepté
- **Date** : 2026-10-22
- **Tâche** : S7.5-T04
- **Modifie** : [ADR-0020](0020-roles-journal-audit.md) (rôles et journal d'audit), [ADR-0034](0034-double-authentification-equipe.md)
  (double authentification de l'équipe), [ADR-0036](0036-ecrans-equipe.md) (espace de l'équipe)

## Contexte

Jusqu'ici, l'équipe n'avait que deux rôles : **modérateur** et **administrateur**. Toute personne qui devait voir les
livraisons, les paiements ou un compte client recevait donc le rôle administrateur, avec tous les droits. Il manquait
aussi un écran pour gérer l'équipe et pour couper l'accès d'un employé qui part. Enfin, rien ne prévenait le titulaire
d'un compte quand son mot de passe était utilisé depuis un appareil inconnu.

Choix du propriétaire :

| Question (date)                                   | Choix                                                                                                                                                                                                                                  |
| ------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Rôles de l'équipe (2026-10-20)                    | **Catalogue** (produits, fiches, boutiques, vérifications), **Logistique** (livraisons, tarifs), **Finance** (paiements, remboursements, encaissements, factures, codes promo), **Service client** (lecture seule), **Administrateur** |
| Départ d'un employé (2026-10-20)                  | **« Retirer ses rôles »** et **« Désactiver le compte »**, sessions coupées tout de suite, tracé au journal                                                                                                                            |
| Nomination d'un administrateur (2026-10-20)       | **Depuis le serveur seulement** (commande `admin:grant`)                                                                                                                                                                               |
| Avis « nouvel appareil » (2026-10-20)             | **Tous les comptes**, avec un lien **« ce n'est pas moi »**                                                                                                                                                                            |
| Ajout d'un membre à l'équipe (2026-10-22)         | **Recherche** d'un compte existant (e-mail ou téléphone), puis rôles cochés                                                                                                                                                            |
| Durée du cookie d'appareil (2026-10-22)           | **1 an**, renouvelé à chaque connexion                                                                                                                                                                                                 |
| Protection contre le clic par erreur (2026-10-22) | Case **« Je confirme »** pour « Retirer ses rôles » et « Désactiver le compte »                                                                                                                                                        |

## Décision

1. **Rôles.** `MODERATOR` est **renommé** `CATALOG` (migration `20261020200000_roles_equipe_appareils`, `ALTER TYPE …
RENAME VALUE`) : les modérateurs gardent leur accès sans perte de ligne. `LOGISTICS`, `FINANCE` et `SUPPORT`
   s'ajoutent. Le contrat partagé définit `ROLES`, `STAFF_ROLES`, `ROLE_IMPLIES`, `hasRole`, `isStaffRoles` et
   `ROLE_LABELS`. Le domaine de l'API en garde une copie, et un test vérifie qu'elle reste identique. Un administrateur
   a les droits de tous les autres rôles. Chaque route de l'API exige **son** rôle. La double authentification est
   obligatoire pour **tout** rôle de l'équipe. Le contrat passe en **2.0.0** : le rôle `moderator` disparaît.
2. **Écran Utilisateurs** (`/equipe/utilisateurs`, administrateurs) :
   - liste de l'équipe par nom (`GET /admin/staff`, filtre par rôle, pages de 50), avec l'état de la double
     authentification et la dernière visite ;
   - ajout : recherche d'un compte (`POST /admin/accounts/lookup`, identifiant dans le **corps**), puis un bouton par
     rôle (`PUT|DELETE /admin/accounts/{id}/roles/{role}` ; `admin` refusé) ;
   - départ : `POST …/remove-staff` retire tous les rôles de l'équipe (le rôle vendeur reste) et ferme les sessions ;
   - `POST …/disable` (motif de 5 à 300 caractères, gardé au journal) et `POST …/enable`.

   Ces actions ne s'appliquent **jamais** à soi-même, ni à un administrateur (`COMPTE_PROTEGE`), ni à un compte
   effacé. Le site exige la case « Je confirme » ; l'API refait toutes les vérifications.

3. **Service client** (`/equipe/clients`) : recherche d'un compte (`POST /support/accounts/lookup`, **inscrite au
   journal** `support.account_viewed`), puis ses commandes en **lecture seule**
   (`GET /support/accounts/{id}/orders[/{reference}]`).
4. **Appareils connus.** Le site garde dans un cookie `HttpOnly` `kemdia_appareil` (préfixe `__Host-` en production)
   un identifiant de 32 octets tiré au hasard. Le cookie est posé ou renouvelé pour un an après chaque connexion
   réussie, et l'identifiant est envoyé dans le champ `device` de la connexion. L'API ne garde que son **empreinte**
   SHA-256 (`identity.known_devices`, 20 appareils au plus par compte, effacés avec le compte) et le résumé du
   navigateur. Le premier appareil d'un compte est retenu sans avis. Pour un appareil inconnu, un e-mail
   « new-device » part, avec une description choisie dans des **listes fixes** (rien n'est recopié de l'en-tête du
   navigateur), l'heure et un lien `/securite/pas-moi?jeton=…`.
5. **« Ce n'est pas moi ».** Le jeton est à **usage unique** et vaut **7 jours** ; seule son empreinte est gardée.
   `POST /auth/devices/not-me` ne demande pas de session : le titulaire n'a peut-être plus accès à son compte. Il ferme
   **toutes** les sessions, oublie l'appareil et écrit `device.not_me` au journal. La page du site **n'agit qu'au
   clic** : une messagerie qui ouvre les liens pour les prévisualiser ne déclenche rien. La page n'est pas indexée et
   n'envoie pas d'en-tête `Referer`.
6. **Après la relecture de sécurité.**
   - Une connexion **sans** identifiant d'appareil (appel direct à l'API) compte comme un appareil inconnu : avis.
   - Seule la connexion qui suit l'inscription (`POST /auth/signup/verify`, champ `device` facultatif) retient
     l'appareil sans avis.
   - Au plus **5 avis** encore valables par compte (`DEVICE_ALERTS_MAX`) : au-delà, l'appareil est retenu et tracé
     (`device.new_login` avec `notice: non`) sans nouvel e-mail. Une ligne qui porte un lien encore valable n'est
     **jamais** oubliée : se connecter 20 fois avec des appareils inventés ne peut plus effacer le lien du titulaire.
   - « Ce n'est pas moi » **bloque le mot de passe** : il est remplacé par l'empreinte d'un secret aléatoire jeté.
   - Appareils pas revus depuis un an purgés par le ménage horaire ; présents dans la copie des données.
   - Service client : chaque lecture des commandes est tracée (`support.orders_viewed`), un compte inconnu répond
     `COMPTE_INTROUVABLE`, une recherche sans résultat est tracée (`support.lookup_failed`, sans l'identifiant).
   - Les rôles de l'équipe d'un administrateur ne se changent pas par l'API (`COMPTE_PROTEGE`) ; le rôle vendeur,
     qui suit la décision sur sa boutique, reste possible.
7. **Lien de l'avis.** Il est construit avec la variable **facultative** `PUBLIC_SITE_URL`. Sans elle, l'avis part sans
   lien.

## Conséquences

- Chaque membre de l'équipe ne voit que les pages de son rôle (menu et gardes du site, et surtout l'API).
- Un départ se règle en deux clics, avec effet immédiat : les rôles sont relus à chaque requête et les sessions sont
  fermées.
- Le titulaire d'un compte est prévenu d'une connexion inconnue et peut tout couper sans se connecter.
- Le rôle **Catalogue** voit les pièces d'identité des vendeurs (vérifications), comme choisi le 2026-10-20.
- Juste après le déploiement, la première connexion de chaque compte existant envoie un avis (aucun appareil n'est
  encore connu).
- Les pages Finance n'existent pas encore sur le site : elles arrivent avec S7.5-T05. Le rôle est déjà en place dans
  l'API.
- **Déploiement** : migration à appliquer (`db:deploy` puis `db:check`). `PUBLIC_SITE_URL` est à définir sur Render
  pour que l'avis contienne le lien. Les comptes `MODERATOR` deviennent `CATALOG` sans intervention.

## Alternatives écartées

- **Permissions à la carte** (cases par action) : trop fin pour une équipe de quelques personnes, et plus difficile à
  relire. Cinq rôles fixes suffisent pour la bêta.
- **Nommer un administrateur depuis l'écran** : écarté. Un compte d'équipe volé pourrait sinon se donner tous les
  droits.
- **Lien « ce n'est pas moi » qui agit dès l'ouverture** : écarté à cause des prévisualisations de liens et des
  antivirus de messagerie.
- **Empreinte du navigateur** (« fingerprinting ») au lieu d'un cookie : écartée. C'est moins fiable, plus intrusif, et
  il faudrait le consentement du visiteur.
