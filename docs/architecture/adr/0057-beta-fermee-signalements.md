# ADR-0057 — Bêta fermée sur invitation et « Signaler un problème »

- **Statut** : Accepté
- **Date** : 2026-10-23
- **Tâche** : S8-T02 (bêta fermée avec les vendeurs partenaires et des testeurs, avant le lancement)
- **Complète** : [ADR-0006](0006-monolithe-modulaire-7-modules.md) (nouveau module `feedback`),
  [ADR-0016](0016-inscription-tickets-emails.md) (inscription sans énumération),
  [ADR-0047](0047-donnees-personnelles-apdpvp.md) (copie, effacement, minimisation),
  [ADR-0051](0051-roles-equipe-utilisateurs.md) (rôles Administrateur et Service client)

## Contexte

Le S8 commence par une **bêta fermée** : seules des personnes choisies (vendeurs partenaires, testeurs) doivent pouvoir
créer un compte, et elles doivent pouvoir dire facilement ce qui ne marche pas. Jusqu'ici, n'importe qui pouvait
s'inscrire et aucun canal ne recueillait les problèmes.

Choix du 2026-10-23 : options recommandées retenues sans être reposées (demande du propriétaire), listées ici :

| Question                    | Choix retenu (recommandé)                                                                                          |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| Comment fermer              | **Interrupteur en base**, changé par l'**administrateur** depuis `/equipe/beta` (aucun réglage Render à toucher)   |
| État au déploiement         | **Ouvert** : rien ne change tant que l'administrateur ne réserve pas l'inscription aux invités                     |
| Ce qui est fermé            | **La création de compte seulement** ; les comptes existants se connectent toujours                                 |
| Forme de l'invitation       | **Liée à l'adresse** (e-mail ou mobile), sans code à recopier ni lien secret                                       |
| Durée, usage                | **30 jours**, **une seule fois** ; annulable ; inviter de nouveau la même adresse **relance** pour 30 jours        |
| Genre d'invitation          | **Vendeur partenaire** ou **testeur** (information ; le rôle vendeur reste donné par la validation de la boutique) |
| Prévenir la personne        | **E-mail d'invitation** quand l'adresse est un e-mail ; sinon (mobile, SMS pas encore choisi) l'équipe prévient    |
| Qui peut signaler           | **Comptes connectés seulement** (les participants de la bêta), pas les visiteurs anonymes                          |
| Qui traite les signalements | **Service client** (et l'administrateur), avec la double authentification                                          |
| Suivi                       | **Nouveau → en cours → résolu**, réouverture possible ; décision sur la version lue                                |
| Conservation                | Effacés **avec le compte** et **180 jours après leur résolution**                                                  |

## Décision

1. **Réglage** `identity.beta_settings` (une seule ligne, `closed`, ouverte par la migration
   `20261023230000_beta_fermee`). `GET /auth/beta` (public) dit au site si l'inscription est réservée aux invités ;
   `GET|PUT /admin/beta/settings` (administrateur + double authentification) le lit et le change, journalisé
   (`settings.beta_updated`, détail `state`).
2. **Invitations** `identity.beta_invitations` : une ligne par adresse normalisée (unique), genre, auteur, échéance,
   date d'utilisation et compte créé, date d'annulation ; contraintes de la base qui doublent le domaine (utilisée ⇔
   compte connu ; jamais utilisée ET annulée ; adresse en minuscules). Routes `GET|POST /admin/beta/invitations` et
   `POST /admin/beta/invitations/{id}/revoke`. Inviter une adresse qui a déjà un compte : `COMPTE_EXISTANT` ; annuler une
   invitation utilisée : `INVITATION_UTILISEE`. Journal `beta.invited` (genre, canal, relance — **jamais l'adresse**)
   et `beta.invitation_revoked`.
3. **Inscription** (`SignupService`) : quand l'inscription est réservée, `start` exige une invitation **valable**
   (`INVITATION_REQUISE`, 403) **avant** de regarder si l'adresse a un compte — la réponse ne dépend que de
   l'invitation, elle ne révèle pas les comptes (ADR-0016) ; `verify` revérifie (invitation annulée, expirée ou
   inscription fermée entre-temps) puis marque l'invitation utilisée par le compte créé.
4. **Invitations dans `identity`** (et non dans un module à part) : l'inscription en dépend ; un module séparé aurait
   dû être importé par `identity`, qui est lui-même importé par tous les modules (dépendance circulaire).
5. **Module `feedback`** (schéma `feedback`) : table `feedback.problem_reports` (genre, description 10–2 000
   caractères, page réduite à son **chemin** sans paramètres ni « //autre-site », appareil **résumé par l'API** à partir
   de listes fixes, état, auteur du traitement). `POST /feedback/problems` (session ; 5 par minute ; 20 signalements non
   résolus au plus par compte, `TROP_DE_SIGNALEMENTS`). `GET /admin/problems` (file du plus ancien, par état) et
   `POST /admin/problems/{id}/status` (version lue, sinon `SIGNALEMENT_MODIFIE`), rôle Service client + double
   authentification, journal `problem.updated`. L'auteur est lu par le port public `AccountDirectory` (nom, e-mail
   vérifié) pour lui répondre.
6. **Données personnelles** : invitation utilisée dans la copie (`identite.invitationBeta`) et signalements
   (`signalements`) ; effacés avec le compte (et toute invitation au nom de ses adresses). Ménage : invitations jamais
   utilisées, expirées ou annulées depuis 30 jours (ménage horaire d'identity) ; signalements résolus depuis 180 jours
   (toutes les 6 heures).
7. **Site** : annonce sur « Créer un compte » quand l'inscription est réservée ; bouton « Signaler un problème » dans le
   pied de page (emporte le chemin de la page) vers `/signaler-un-probleme` (connexion exigée) ; pages de l'équipe
   `/equipe/beta` (administrateur) et `/equipe/signalements` (service client).
8. Contrat de l'API **2.6.0** (7 routes nouvelles).

## Conséquences

- L'administrateur ferme l'inscription quand il le veut, sans redéploiement ; la rouvrir au lancement est un clic.
- Une personne invitée sur un **mobile** ne reçoit rien tant que le fournisseur SMS n'est pas choisi (question du
  client) : l'équipe la prévient elle-même, et l'inscription par mobile reste de toute façon indisponible.
- Une adresse peut savoir si elle est invitée (elle obtient un code ou `INVITATION_REQUISE`) : c'est le but, et cela ne
  dit rien des comptes existants.

## Alternatives écartées

- **Variable d'environnement** (`BETA_FERMEE`) : il aurait fallu changer les réglages Render et redéployer à chaque
  ouverture ou fermeture.
- **Code d'invitation à recopier** ou **lien secret** : un code se partage et un lien fuit (journaux, transferts
  d'e-mail) ; lier l'invitation à l'adresse vérifiée par le code d'inscription suffit.
- **Signalements anonymes** : spam sans limite par compte, et impossible de répondre ; la bêta est fermée de toute façon.
- **Outil externe** (formulaire hébergé ailleurs) : données personnelles hors de Kemdia, sans lien avec le compte.
