# Rapport — S4-T06 : rôles (RBAC) et journal d'audit

|                                                 |                                                            |
| ----------------------------------------------- | ---------------------------------------------------------- |
| **Date**                                        | 2026-10-08                                                 |
| **Sprint / tâches**                             | S4 — S4-T06                                                |
| **Version**                                     | v0.4.0 (en cours) — contrat de l'API 1.5.0                 |
| **Sections du cahier d'architecture modifiées** | §3.3, §3.5, §3.7, §3.9, §3.10 (nouvelle), §6 (version 2.6) |

## 1. Résumé

Chaque compte a maintenant des **rôles** : `client` (tout compte), `vendor` (vendeur), `moderator` (modérateur) et `admin`
(administrateur), **cumulables**. L'API sait protéger une route par rôle avec une seule ligne (`@Authorize(...)`), réutilisable
par les modules des sprints suivants. Les **actions sensibles** sont inscrites dans un **journal d'audit** que la base de données
refuse de modifier, gardé 365 jours. Le premier administrateur se crée par une **commande serveur**, sans aucun secret dans Git.
Sur le site, « Mon compte » affiche « **Vos rôles** ».

## 2. Fonctionnalités livrées

| Élément                 | Ce que ça fait                                                                                                                       | Fichiers principaux                                          |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------ |
| Rôles                   | 4 rôles cumulables ; `admin` a les droits de `moderator` ; lus avec le compte **à chaque requête**                                   | `identity/domain/role.ts`, table `identity.account_roles`    |
| Garde réutilisable      | `@Authorize("vendor")`, `@Authorize("admin", { recentLogin: true })` : session puis rôle ; fermée par défaut                         | `identity/interface/role.guard.ts`                           |
| Attribution             | Un administrateur accorde / retire `vendor` ou `moderator` à un **autre** compte ; jamais `admin` par l'API                          | `identity/application/role.service.ts`                       |
| Routes d'administration | `POST /admin/accounts/lookup`, `PUT\|DELETE /admin/accounts/{id}/roles/{role}`, `GET /admin/audit` (connexion < 15 min)              | `identity/interface/admin.controller.ts`, `admin.openapi.ts` |
| Premier administrateur  | `pnpm --filter @kemdia/api admin:grant <e-mail>` / `admin:revoke` sur un compte inscrit et vérifié                                   | `apps/api/src/cli/admin-role.ts`                             |
| Journal d'audit         | Nouveau module `audit` : qui, quoi, sur quoi, quand, d'où ; `role.granted`, `role.revoked`, `password.reset`, `sessions.revoked_all` | `modules/audit/`, table `audit.events`                       |
| Ajout seul              | Déclencheurs SQL : modification interdite, suppression seulement après 365 jours, `TRUNCATE` interdit, date posée par la base        | migration `20261008230000_roles_journal_audit`               |
| Transaction partagée    | L'action et sa ligne de journal sont écrites **ensemble ou pas du tout**, même si elles sont dans deux modules                       | `src/database/transaction-context.ts`                        |
| Purge                   | Toutes les 6 h, lignes de plus de 365 jours, par lots de 1 000                                                                       | `audit/infrastructure/audit-retention.ts`                    |
| Contrat 1.5.0           | `roles` dans le compte ; `AdminAccount`, `AuditEvent`, `AuditPage` ; 6 nouveaux codes d'erreur                                       | `packages/contracts`, `docs/api/openapi.json`                |
| Site                    | « Vos rôles » sur Mon compte (Client, Vendeur, Modérateur, Administrateur) ; messages des nouveaux codes                             | `components/account/RoleList.tsx`, `app/compte/page.tsx`     |

## 3. Décisions techniques

[ADR-0020](../architecture/adr/0020-roles-journal-audit.md), avec tes choix du 2026-10-08 :

| Question                | Ton choix                                                                                |
| ----------------------- | ---------------------------------------------------------------------------------------- |
| Liste des rôles         | 4 rôles cumulables (client, vendeur, modérateur, administrateur)                         |
| Qui attribue            | L'administrateur, pour vendeur et modérateur ; `admin` jamais par l'API ; jamais sur soi |
| Premier administrateur  | Commande en ligne, lancée depuis ton poste (pour la démo : avec l'adresse Neon)          |
| Journal                 | Actions sensibles, gardées 1 an, table en ajout seul                                     |
| Affichage               | API + « Vos rôles » sur Mon compte ; écrans d'administration au S6 (avec la 2FA)         |
| Routes d'administration | Connexion de moins de 15 minutes exigée                                                  |

En plus :

- **Nouveau module `audit`** (schéma PostgreSQL `audit`) : tous les modules pourront y écrire sans dépendre d'`identity`.
  Les routes de **lecture** sont dans `identity`, pour éviter que les deux modules dépendent l'un de l'autre.
- **Aucun réglage `.env` ni Render à changer.** La migration s'applique toute seule au prochain déploiement de la démo.

## 4. Sécurité

- **CRIT-06** (élévation vers superutilisateur) et **MED-07** (pas de hiérarchie) de l'ancien projet : **fermés côté API**.
  Le rôle `admin` est refusé à trois niveaux : contrat (seuls `vendor` et `moderator` acceptés dans l'adresse), règle métier,
  et base (un rôle ne peut pas être accordé par son propre titulaire).
- Les rôles sont relus à chaque requête : un rôle **retiré** ne sert plus, **tout de suite**.
- Le journal ne contient **jamais** de mot de passe, de code, de jeton ni d'adresse e-mail (testé).
- **Relecture de sécurité indépendante** (agent séparé, avant la PR) : aucun défaut critique ni grave. Corrigé :
  1. **(Moyen)** un administrateur pouvait modifier ses propres rôles en écrivant **son UUID en majuscules** (PostgreSQL ignore
     la casse des UUID, le code non) → UUID ramené en minuscules par le contrat et comparaison sans casse ; test ajouté ;
  2. **(Moyen)** « Déconnecter tous mes appareils » cliqué en boucle remplissait le journal de lignes inutiles, impossibles à
     effacer avant un an → plus de ligne quand aucune session n'est fermée ;
  3. **(Bas)** le statut du compte était vérifié hors de la transaction → relu **sous verrou** (`FOR SHARE`) au moment d'accorder
     le rôle : un compte désactivé ou supprimé au même instant ne reçoit rien ; test ajouté ;
  4. **(Bas)** une règle `@Authorize` posée sur une méthode remplaçait celle du contrôleur → les deux sont maintenant **exigées** ; tests ajoutés.
- Points notés par la relecture, gardés pour la suite (voir §7) : déclencheurs désactivables par le propriétaire de la table (S7),
  identifiant de requête fourni par l'appelant, limite de débit des routes `/admin` inopérante pour les appels du site (S4-T07).

## 5. Qualité

| Vérification                                               | Résultat                                                                                                                                         |
| ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| Tests de l'API (sans base)                                 | 342 réussis (40 fichiers), dont rôles, garde, administration HTTP, commande serveur                                                              |
| Tests d'intégration (vraie PostgreSQL)                     | 69 réussis, dont : transaction commune (journal en panne → rôle annulé), attributions simultanées, ajout seul, antidatage impossible, pagination |
| Tests du contrat                                           | 12 réussis                                                                                                                                       |
| Tests du site                                              | 191 réussis                                                                                                                                      |
| `typecheck`, `lint`, `build` (Turborepo)                   | OK                                                                                                                                               |
| Commande `admin:grant` / `admin:revoke` sur une vraie base | OK (accordé, déjà accordé, compte inconnu, retiré ; lignes `system` au journal)                                                                  |
| Test de bout en bout                                       | « Vos rôles : Client » vérifié sur Mon compte (CI)                                                                                               |
| CI de la PR                                                | voir la PR                                                                                                                                       |

## 6. Captures d'écran

Pas de nouvel écran en dehors de la ligne « Vos rôles » de Mon compte (vérifiée par le test de bout en bout).

## 7. Limites connues / dette technique

- **Pas d'écran d'administration** : tout passe par l'API (`/api/docs` en local) jusqu'au S6, avec la double authentification (MED-15).
- **Adresse IP du journal** : pour une action passée par le site, c'est celle du **serveur du site** ; celle du visiteur arrivera avec le S4-T07.
- **Limites de débit** : la clé interne du site exempte ses appels ; les limites par compte / visiteur sont prévues au **S4-T07**
  (à appliquer aussi à « tous mes appareils » et aux routes `/admin`).
- **Déclencheurs du journal** : le compte PostgreSQL de l'API est propriétaire des tables et pourrait les désactiver ; les deux
  rôles PostgreSQL du **S7** fermeront ce point.
- **Identifiant de requête** : il peut venir de l'en-tête `X-Request-Id` de l'appelant ; il sert à relier les journaux, pas de preuve.
- Le site garde la session 10 s en mémoire : un rôle retiré peut encore **s'afficher** jusqu'à 10 s (l'API refuse déjà l'action).

## 8. Prochaines étapes

- **S4-T07** : CSRF, CSP à _nonce_, limites par compte et par visiteur (dont l'adresse IP du visiteur dans le journal).
- **S4-T08** : démo, dette (page « la boutique se réveille », colonnes `failed_logins` / `locked_until`), clôture du sprint (v0.4.0).
- Après la fusion : créer ton compte administrateur sur la démo (guide [demo-gratuite.md](../guides/demo-gratuite.md), étape 8).
