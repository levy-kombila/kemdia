# ADR-0047 — Données personnelles : conformité APDPVP (copie, suppression, comptes inactifs)

- **Statut** : Accepté
- **Date** : 2026-10-19
- **Tâche** : S7-T08
- **Complète** : [ADR-0006](0006-monolithe-modulaire-7-modules.md) (modules), [ADR-0020](0020-roles-journal-audit.md)
  (journal d'audit, transaction partagée), [ADR-0039](0039-verification-vendeurs.md) (KYC)

## Contexte

Kemdia traite des données personnelles de clients et de vendeurs gabonais. La **loi n°001/2011 modifiée par la loi
n°025/2023**, contrôlée par l'**APDPVP**, impose notamment :

- consentement par un acte explicite (art. 72), pas seulement l'acceptation des conditions ;
- autorisation parentale avant 18 ans (art. 74) ;
- droits d'accès, de rectification, d'effacement « dans les meilleurs délais » et de portabilité (art. 43 à 59) ;
- conservation pas plus longue que nécessaire (art. 70) ;
- déclaration des traitements (art. 78) et des transferts hors du Gabon (art. 87) ;
- notification des violations « sans délai excessif » (art. 79).

Les amendes vont de 1 à 100 millions de FCFA. Jusqu'ici, rien ne permettait à un client de récupérer ou d'effacer ses
données, et les pages légales étaient vides.

Choix du propriétaire (2026-10-19) :

| Question              | Choix                                                                                                 |
| --------------------- | ----------------------------------------------------------------------------------------------------- |
| Suppression du compte | **Effacement après mot de passe** ; refusée tant qu'une commande est en cours ou une boutique ouverte |
| Commandes et factures | **Factures gardées 10 ans (OHADA)**, le reste anonymisé                                               |
| Copie des données     | **Fichier JSON** dans « Mon compte »                                                                  |
| Informations légales  | **« À compléter »** + question ouverte n°10 (rien d'inventé)                                          |
| Mineurs               | **Case « J'ai 18 ans ou plus »**, distincte des conditions ; date gardée comme preuve                 |
| Cookies               | **Pas de bandeau** : seuls des cookies strictement nécessaires, listés dans la politique              |
| Comptes inactifs      | **3 ans** puis effacement, **avis par e-mail 30 jours avant** ; tâche de nuit                         |

## Décision

1. **Module `privacy`** (API), sans table. Chaque module décrit ses propres données dans une classe
   `XxxPersonalData` (copie, empêchements, effacement) exportée par son `index.ts`. `privacy` les assemble et
   n'est importé par personne : pas de dépendance circulaire.
2. **Routes** (contrat 1.23.0) :
   - `GET /api/v1/account/data` : copie JSON (`kemdia-donnees-personnelles/1`), lue dans une transaction, inscrite
     au journal (`account.data_exported`) ;
   - `GET /api/v1/account/deletion` : possible ? sinon pourquoi ;
   - `POST /api/v1/account/delete` `{password, confirm: true}` : 204.
3. **Suppression.**
   - Le mot de passe est vérifié par `PasswordConfirmationService` (extrait du changement de mot de passe, S7-T07) :
     3 erreurs → blocage 15 minutes et session fermée, compteur propre (`delete:<id>`).
   - Puis UNE transaction : compte puis panier verrouillés (`FOR UPDATE` ; la création d'une commande verrouille le
     même panier, elle finit donc avant ou attend), empêchements revérifiés (409) — `COMMANDE_EN_COURS`,
     `REMBOURSEMENT_EN_ATTENTE`, `PAIEMENT_EN_ATTENTE` (Mobile Money sans réponse, ou expiré / échoué depuis moins de
     24 h : une confirmation tardive créerait un remboursement), `BOUTIQUE_OUVERTE` (en attente, ouverte ou
     suspendue), `COMPTE_EQUIPE` —, effacement de tous les modules, journal
     `account.deleted`. Un avis part ensuite à l'ancienne adresse.
   - Le compte garde son UUID (les commandes et factures y renvoient) mais devient « Compte supprimé », sans e-mail ni
     téléphone, désactivé, avec une empreinte de mot de passe inutilisable ; sessions, rôles, double authentification,
     tickets et codes sont supprimés.
   - Commandes, paiements, remboursements faits : **anonymisés** (nom, téléphones, quartier, repère effacés ;
     montants et statuts gardés). Panier, dossier KYC supprimés. Notes libres des livraisons effacées.
   - Factures : gardées 10 ans telles qu'émises, acheteur compris (nom, téléphone, adresse : obligation légale, une
     facture ne change jamais) ; plus aucun envoi en attente. Le site et l'e-mail le disent clairement.
4. **Base de données.** Les règles « figées » (triggers) des commandes, paiements, remboursements et de
   l'historique des livraisons gardent leur rigueur ; seule exception : **une** anonymisation, qui ne peut effacer que
   les coordonnées (ligne comparée en entier avec `to_jsonb`, sans les colonnes effacées ni `updated_at`). Ensuite la
   ligne est de nouveau figée. Contraintes : un compte effacé n'a ni e-mail ni téléphone et reste désactivé.
5. **Comptes inactifs.** `last_active_at` est mis à jour à chaque connexion et au plus une fois par heure pendant
   une visite. Chaque nuit (2 h à Libreville), `InactivityScheduler` :
   - prévient les comptes sans activité depuis 3 ans moins 30 jours (e-mail, journal `account.inactivity_notified`) ;
   - efface, 30 jours après l'avis, ceux qui ne sont pas revenus (relu sous verrou ; une connexion annule l'avis) ;
   - n'efface jamais un compte de l'équipe ni un compte bloqué par une commande ou une boutique (compté, journalisé).
6. **Consentement.** L'inscription exige deux cases distinctes : conditions générales et « J'ai 18 ans ou plus »
   (`adult: true` dans le contrat). Les dates (`terms_accepted_at`, `adult_confirmed_at`) servent de preuve.
7. **Site.**
   - Section « Mes données » dans Mon compte : téléchargement de la copie (relayée par le serveur du site), suppression
     (mot de passe + case « définitif »), empêchements expliqués.
   - Politique de confidentialité et mentions légales réécrites ; les informations du responsable sont dans
     `lib/legal.ts`, affichées « à compléter » tant que le client ne les a pas données.
   - Pas de bandeau cookies : aucun cookie publicitaire ni de mesure d'audience ; les cookies de session et les clés
     du stockage du navigateur (panier, favoris, ville) sont listés.
8. **Documents.** `docs/conformite/` : registre des traitements, procédure des demandes de droits, procédure de
   violation de données.

## Conséquences

- Contrat de l'API 1.23.0 ; migration `20261019150000_donnees_personnelles` (à appliquer : `db:deploy` puis
  `db:check`).
- Un nouveau module avec des données personnelles doit fournir sa classe `XxxPersonalData` et l'ajouter au module
  `privacy` ; sinon la copie et l'effacement seraient incomplets.
- Une donnée effacée reste dans les sauvegardes chiffrées jusqu'à leur rotation (6 mois au plus) : écrit dans la
  politique.
- **Risque accepté** : une demande de boutique envoyée pendant l'effacement (même seconde) pourrait être créée
  après lui ; elle resterait en attente, sans propriétaire joignable, et l'équipe la refuserait (le propriétaire
  désactivé empêche de la valider).
- L'avis d'inactivité ne part que par un canal disponible (e-mail ; pas encore de SMS). Sans canal, le compte n'est
  ni prévenu ni effacé : on réessaie chaque nuit. Un avis n'est noté que si le compte est toujours inactif à
  l'écriture (une connexion entre-temps l'emporte).
- Un paiement confirmé par l'opérateur après l'effacement (au-delà de 24 h) ne peut plus créer de remboursement
  (numéro effacé) : l'API l'écrit en erreur dans ses journaux, à traiter à la main.
- Un compte désactivé par l'équipe ne peut ni télécharger sa copie ni se supprimer (pas de session) : sa demande
  passe par la procédure écrite. Il est effacé lui aussi après 3 ans sans activité.
- La copie contient aussi le journal d'audit du compte (action, date ; adresse IP seulement pour ses propres
  actions). Le journal n'est pas effacé : ajout seul, purgé après 365 jours.
- Base de données (défense en profondeur) : l'anonymisation est refusée sur une commande non terminée ou un essai
  de paiement en attente.
- Rien ne vaut la déclaration à l'APDPVP : elle reste à faire par le client (question n°10).

## Alternatives écartées

- **Désactiver sans effacer** : contraire au droit à l'effacement.
- **Supprimer les lignes de commandes et factures** : contraire à l'obligation comptable (10 ans) et aux règles
  « ajout seul ».
- **Bandeau cookies** : inutile sans cookie non nécessaire ; il habituerait à cliquer « accepter ».
- **Effacement en différé (file d'attente)** : plus complexe ; l'effacement immédiat dans une transaction est plus
  simple à prouver et à tester.
- **Date de naissance** : plus de données pour le même but ; la case « 18 ans ou plus » suffit (minimisation).
