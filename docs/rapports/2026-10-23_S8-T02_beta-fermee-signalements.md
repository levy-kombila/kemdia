# Rapport — S8-T02 : bêta fermée sur invitation et « Signaler un problème »

|                                                 |                                                      |
| ----------------------------------------------- | ---------------------------------------------------- |
| **Date**                                        | 2026-10-23                                           |
| **Sprint / tâches**                             | S8 — S8-T02                                          |
| **Version**                                     | v0.8.1 → (v0.9.x à la clôture du S8) ; contrat 2.6.0 |
| **Sections du cahier d'architecture modifiées** | §3.31 (nouvelle) — version 4.27                      |

## 1. Résumé

Kemdia peut maintenant passer en **bêta fermée** et recueillir les problèmes des testeurs :

- L'administrateur **réserve la création de compte aux invités** d'un clic (`/equipe/beta`), et la rouvre de même.
  Au déploiement, l'inscription reste **ouverte** : rien ne change tant qu'il ne la ferme pas ;
- Il **invite une adresse** (vendeur partenaire ou testeur) : la personne crée son compte avec cette adresse, sans code
  à recopier. L'invitation vaut **30 jours**, sert **une fois**, s'annule et se relance ; un e-mail part tout seul ;
- Les **comptes existants** se connectent toujours, bêta fermée ou non ;
- Un bouton **« Signaler un problème »** est sur toutes les pages (pied de page). Réservé aux comptes connectés, il
  envoie le genre du problème, la description et la page concernée ;
- Le **service client** suit les signalements (`/equipe/signalements`) : nouveau → en cours → résolu (ou rouvert), avec
  le nom et l'e-mail vérifié de l'auteur pour lui répondre.

```
Équipe — /equipe/beta (administrateur)
  Création de compte : Ouverte à tous            [ Réserver aux invités ]
  Inviter : [ awa@exemple.ga        ] [ Testeur ▾ ] [ Inviter ]
  awa@exemple.ga · Testeur · Valable · jusqu'au 22/11/2026     [ Annuler ]
Toutes les pages — pied de page
  [ ⚠ Signaler un problème ]  →  Genre ▾  [ Ce qui s'est passé… ]  [ Envoyer ]
Équipe — /equipe/signalements (service client)
  Paiement · 23/10 22:05 · Chrome sur Android · page /commande
  « Le paiement Airtel tourne sans fin. »  — Awa Ndong · awa@exemple.ga   [ Prendre en charge ] [ Résolu ]
```

## 2. Fonctionnalités livrées

| Élément           | Ce qui change                                                                                                                                                   | Où                                                                       |
| ----------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| Base              | `identity.beta_settings` (ouvert), `identity.beta_invitations` ; schéma `feedback`, table `problem_reports` ; contraintes de la base                            | migration `20261023230000_beta_fermee`                                   |
| Inscription       | Bêta fermée : invitation valable exigée avant de regarder si l'adresse a un compte, revérifiée au code, puis marquée utilisée                                   | `signup.service.ts`, `beta.service.ts`                                   |
| Invitations (API) | `GET /auth/beta` ; `GET/PUT /admin/beta/settings` ; `GET/POST /admin/beta/invitations` ; `POST …/{id}/revoke`                                                   | `beta.controller.ts`, `beta.openapi.ts`                                  |
| E-mail            | « Vous êtes invité à la bêta de Kemdia » avec le bouton « Créer mon compte »                                                                                    | `email-templates.ts`                                                     |
| Module API        | Nouveau module `feedback` : `POST /feedback/problems` ; `GET /admin/problems` ; `POST …/{id}/status`                                                            | `apps/api/src/modules/feedback`                                          |
| Journal           | `settings.beta_updated`, `beta.invited` (sans l'adresse), `beta.invitation_revoked`, `problem.updated`                                                          | `audit-event.ts`, contrat                                                |
| Données perso.    | `identite.invitationBeta` et `signalements` dans la copie ; effacés avec le compte ; ménage à 30 jours (invitations mortes) et 180 jours (signalements résolus) | `identity-personal-data.ts`, `feedback-personal-data.ts`, ménages        |
| Site              | Annonce sur « Créer un compte » ; bouton et page « Signaler un problème » ; pages de l'équipe « Bêta fermée » et « Signalements »                               | `app/signaler-un-probleme`, `app/equipe/beta`, `app/equipe/signalements` |
| Contrat           | Schémas, codes `INVITATION_*`, `COMPTE_EXISTANT`, `SIGNALEMENT_*`, `TROP_DE_SIGNALEMENTS`, libellés ; version **2.6.0**                                         | `packages/contracts`, `docs/api/openapi.json`                            |

## 3. Décisions techniques

Choix du 2026-10-23 : à ta demande, les **options recommandées** sont retenues sans t'être reposées. Les voici, pour
validation à la lecture de la PR :

- fermeture par un **interrupteur en base** changé par l'**administrateur** (aucun réglage Render à toucher, pas de
  redéploiement) ; **ouvert** au déploiement ;
- seule la **création de compte** est fermée ; les comptes existants se connectent toujours ;
- invitation **liée à l'adresse** (pas de code ni de lien secret), **30 jours**, **une fois**, annulable, relançable ;
- genre **vendeur partenaire** ou **testeur** (information : le rôle vendeur reste donné par la validation de la
  boutique) ;
- e-mail d'invitation automatique ; pour un **mobile**, l'équipe prévient la personne (SMS : **en attente du client**,
  fournisseur pas encore choisi) ;
- signalements réservés aux **comptes connectés**, traités par le **service client** ; effacés avec le compte et
  **180 jours** après leur résolution.

Points d'architecture :

- les **invitations restent dans `identity`** : l'inscription en dépend, un module à part aurait créé une dépendance
  circulaire ; les **signalements** sont un module à part (`feedback`), qui lit l'auteur par le port public
  `AccountDirectory` ;
- la **page** d'un signalement est réduite à son **chemin** (sans paramètres, qui peuvent contenir un jeton) et
  l'**appareil** est choisi par l'API dans des listes fixes (« Chrome sur Android »), jamais recopié du navigateur.

Décision complète : [ADR-0057](../architecture/adr/0057-beta-fermee-signalements.md).

## 4. Sécurité

### Relecture indépendante (agent séparé, avant la PR) : 0 critique, 0 haute, 2 moyennes, 6 basses, 3 infos

| Problème relevé                                                                                                                         | Correction                                                                                                                                                              |
| --------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Moyenne : les invitations pouvaient envoyer des e-mails en rafale à une même adresse (relances sans limite, pas de limite par visiteur) | 30 requêtes/min par visiteur sur `/admin/beta/*`, 10 invitations/min par compte ; une relance de moins d'une heure prolonge l'invitation **sans** nouvel e-mail ; testé |
| Moyenne : en bêta fermée, l'inscription dit si une adresse est invitée (403 ou code envoyé)                                             | **Risque accepté et écrit** dans l'ADR-0057 : la bêta est annoncée publiquement, l'information est peu sensible ; les comptes existants ne sont toujours pas révélés    |
| Basse : si le contrôle d'invitation n'était pas branché, l'inscription redevenait ouverte en silence                                    | Dépendance **obligatoire** de l'inscription (plus de `@Optional`)                                                                                                       |
| Basse : compte créé et invitation marquée utilisée ne sont pas atomiques                                                                | **Risque accepté et écrit** : fenêtre d'une milliseconde, la clé étrangère exige le compte d'abord ; une invitation ne crée jamais deux comptes                         |
| Basse : deux invitations simultanées de la même adresse donnaient une erreur 500                                                        | Écriture **par l'adresse unique** : une seule ligne, deux réponses 201 ; testé sur la base                                                                              |
| Basse : la limite de 20 signalements non résolus peut être dépassée par des envois simultanés                                           | **Risque accepté et écrit** (quelques unités au plus, 5 envois par minute)                                                                                              |
| Basse : un caractère de contrôle « C1 » (U+0085…) dans la page donnait une erreur 500 (refusé par la base, pas par le domaine)          | Domaine et site refusent aussi U+0080–U+009F ; testé                                                                                                                    |
| Basse : la file du service client lisait un compte par signalement                                                                      | Chaque auteur lu **une seule fois** par page                                                                                                                            |
| Info : les routes d'inscription ne documentaient pas le nouveau 403                                                                     | `403 INVITATION_REQUISE` ajouté à `POST /auth/signup` et `/signup/verify` ; description régénérée                                                                       |
| Info : la page de l'équipe affichait « changé le … » alors que personne n'avait touché au réglage                                       | Pas de date tant que personne ne l'a changé ; testé                                                                                                                     |
| Info : inversions du sens d'écriture dans un signalement (texte trompeur) ; export inutile ; signalements jamais résolus gardés         | Inversions refusées ; export retiré ; conservation des signalements non résolus **écrite dans l'ADR** (à revoir en fin de bêta)                                         |

Sans problème selon la relecture : routes de la bêta réservées à l'administrateur et celles des signalements au
service client, toujours avec la double authentification ; envoi d'un signalement avec une session seulement ;
invitation vérifiée **avant** l'existence du compte (aucune énumération des comptes) et revérifiée au code ;
adresses normalisées pareil pour l'invitation et le compte (et contrôlé par la base) ; usage unique ; textes affichés
échappés par React, sans lien ; chemin de page sans « //autre-site » ni paramètres ; appareil jamais recopié du
navigateur ; journal sans adresse ni message ; copie et effacement des données ; requêtes paramétrées et curseurs
vérifiés ; architecture respectée (portes `index.ts`, domaine sans framework).

### Corrections après la première CI

| Problème relevé                                                                                                                                                   | Correction                                                                                                                                         |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| Audit des dépendances : faille **haute** publiée le jour même dans Zod (`< 4.6.6`, mémoire épuisée par une collection trop grande, GHSA-mrhx-c7xc-m3w5)           | Zod **4.6.5 → 4.6.7** (API, site, contrat) ; `pnpm audit --prod` à nouveau sans faille ; description OpenAPI inchangée ; tous les tests relancés ✓ |
| Accessibilité sur mobile : le bouton rendait le pied de page plus haut que la place réservée avant son affichage (74rem) ; sa dernière ligne paraissait sans fond | Place réservée portée de 68rem à **74rem** ; bouton sur fond blanc opaque (contraste indépendant de ce qu'il y a derrière)                         |

## 5. Qualité

- Format et lint sur tout le dépôt, typecheck et build : ✓.
- API : **651 tests unitaires** ✓, dont invitations (adresse normalisée, journal sans l'adresse, mobile sans
  e-mail, compte existant, relance et annulation, pas d'e-mail en rafale) et inscription en bêta fermée (refus sans
  invitation même pour un compte existant, invitation utilisée, invitation expirée pendant l'inscription),
  signalements (description, page réduite, inversions refusées, limite de 20, version lue).
- API : **251 tests d'intégration** sur une vraie base neuve ✓, dont `beta.int.test.ts` (réglage public et
  réservé à l'administrateur, parcours d'invitation jusqu'au compte, annulation puis relance, invitations simultanées,
  signalement suivi par le service client, contrainte SQL du chemin, copie et effacement).
- Site : **491 tests** ✓ ; contrat : **34 tests** ✓ ; description OpenAPI régénérée
  (contrat 2.6.0).
- Bout en bout (CI) : bouton « Signaler un problème » (connexion exigée, page d'origine gardée), pages
  `/equipe/beta` et `/equipe/signalements` avec l'accessibilité.
- Migration appliquée sur une base neuve avec toutes les précédentes.
- Gitleaks v8.30.1 ✓ ; Semgrep, Playwright, CodeQL et ZAP : par la CI.

## 6. Captures d'écran

Les pages sont parcourues par les tests de bout en bout de la CI et seront visibles sur la démo après le déploiement.

## 7. Limites connues / dette technique

- Invitation par **mobile** : enregistrée, mais aucun SMS n'est envoyé (fournisseur **en attente du client**) et
  l'inscription par mobile reste indisponible.
- Pas de **réponse** au signalement depuis Kemdia : le service client écrit à l'auteur avec sa propre messagerie.
- Pas de **capture d'écran** jointe à un signalement.
- Risques acceptés listés dans l'ADR-0057 (savoir si une adresse est invitée, atomicité compte/invitation, limite de
  20 dépassable de peu, signalements non résolus gardés).

## 8. Prochaines étapes

- Après la fusion : `pnpm --filter @kemdia/api db:deploy`, puis `db:check` (nouvelles tables `identity.beta_*` et
  nouveau schéma `feedback`) ; attendre « Déploiement DÉMO (Render) ».
- Pour lancer la bêta : `/equipe/beta` → inviter les vendeurs partenaires et les testeurs, puis « Réserver aux
  invités ».
- S8-T03 proposée : import du vrai catalogue (fichier des vendeurs partenaires et de l'équipe).
