# Rapport — S4-T04 : mot de passe oublié

|                                                 |                   |
| ----------------------------------------------- | ----------------- |
| **Date**                                        | 2026-10-08        |
| **Sprint / tâches**                             | S4 — S4-T04       |
| **Version**                                     | v0.4.0 (en cours) |
| **Sections du cahier d'architecture modifiées** | §3.7, §3.9, §6.3  |

## 1. Résumé

Un client qui a oublié son mot de passe peut maintenant en choisir un nouveau : il donne son adresse e-mail, reçoit un **code à
6 chiffres**, puis tape ce code et son nouveau mot de passe. Il est alors **connecté sur cet appareil et déconnecté partout
ailleurs**, et le blocage après 3 erreurs (BR-040) est levé. Il reçoit un e-mail « Votre mot de passe a été modifié ».
Une adresse **sans compte** obtient exactement la même réponse, mais **ne reçoit rien** : rien ne révèle qui est client.
Le site sera branché sur ces routes au S4-T05.

## 2. Fonctionnalités livrées

| Élément                         | Ce que ça fait                                                                                           | Fichiers principaux                                   |
| ------------------------------- | -------------------------------------------------------------------------------------------------------- | ----------------------------------------------------- |
| `POST /auth/password/forgot`    | Envoie un code si un compte existe ; renvoie un ticket dans tous les cas (202)                           | `password-reset.service.ts`, `identity.controller.ts` |
| `POST /auth/password/resend`    | Nouveau code (60 s entre deux, 5 par heure) ; rien n'est envoyé pour un ticket leurre                    | `password-reset.service.ts`                           |
| `POST /auth/password/reset`     | Ticket + code + nouveau mot de passe → session ouverte (200)                                             | `password-reset.service.ts`                           |
| Changement en une transaction   | Nouveau mot de passe, tickets supprimés, toutes les sessions fermées, blocage levé (e-mail et téléphone) | `prisma-reset-ticket.repository.ts` (`applyReset`)    |
| Version du mot de passe         | Chaque session garde la version du mot de passe ; une session d'une ancienne version est refusée         | `domain/account.ts`, `session.service.ts`             |
| E-mail « mot de passe modifié » | Prévient le titulaire, sans lien ni image                                                                | `infrastructure/email/email-templates.ts`             |
| Ménage horaire                  | Supprime aussi les tickets expirés                                                                       | `infrastructure/identity-maintenance.ts`              |
| Base                            | Table `identity.reset_tickets` ; colonne `password_version` sur `accounts` et `sessions`                 | migration `…_mot_de_passe_oublie`                     |
| Contrat                         | `ForgotPasswordRequest`, `ResetStarted`, `ResetResendRequest`, `ResetPasswordRequest` ; OpenAPI 1.4.0    | `packages/contracts`, `docs/api/openapi.json`         |

## 3. Décisions techniques

[ADR-0018](../architecture/adr/0018-mot-de-passe-oublie.md), avec tes deux choix du 2026-10-08 :
**connecté ici, déconnecté ailleurs** et **même réponse, aucun e-mail** pour une adresse sans compte.

- Pas de lien dans l'e-mail (règle des e-mails Kemdia) : le code se tape sur la page, avec le **ticket** gardé par le navigateur.
- Le mot de passe trop faible est refusé **avant** de regarder le code : une faute de frappe ne fait pas perdre un essai.
- Le téléphone reste « bientôt disponible » (`SMS_ENABLED=false`).

## 4. Sécurité

- **Pas d'énumération** : même statut, mêmes champs, mêmes limites d'envoi et **même suite d'erreurs** sur de mauvais codes,
  avec ou sans compte (vérifié par des tests). Un compte désactivé est traité comme une adresse sans compte.
- **Une seule réussite** : 5 validations simultanées du même bon code → une seule passe (test sur PostgreSQL).
- **Relecture indépendante** (second agent) : aucun défaut critique ni grave ; corrigé avant la PR :
  1. _(moyen)_ une connexion commencée avec l'ancien mot de passe juste avant le changement pouvait ouvrir une session qui
     survivait → chaque session porte la **version du mot de passe** ; une session d'une ancienne version est refusée ;
  2. _(moyen)_ les étapes du changement étaient séparées : une panne au milieu pouvait laisser les anciennes sessions ouvertes
     → **une seule transaction** ;
  3. _(faible)_ l'enregistrement du compte réécrivait toute la ligne → mise à jour ciblée (compte actif, bonne version) ;
  4. _(faible)_ le ticket n'était pas comparé à l'adresse actuelle du compte → refusé si l'adresse a changé ;
  5. _(faible)_ tests ajoutés (renvoi d'un leurre, même suite d'erreurs, connexion en retard) ; erreur 422 documentée sur `/resend`.
     Deuxième relecture des corrections : **OK**.
- Accepté et noté : l'envoi de l'e-mail démarre avant la réponse quand un compte existe (moins d'une milliseconde d'écart).

## 5. Qualité

| Vérification                                | Résultat                                                                                                                                                                                       |
| ------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Tests unitaires de l'API                    | 307 (23 nouveaux) : parcours, leurre, mot de passe faible, blocage levé, sessions, connexion en retard, routes HTTP, e-mail                                                                    |
| Tests d'intégration (vraie base PostgreSQL) | 59 (7 nouveaux) : parcours complet, une demande par adresse, validations simultanées, cascade, transaction annulée, ménage                                                                     |
| Essai réel (API compilée, base PostgreSQL)  | Inscription → connexion ; « oublié » sans compte : 202 sans e-mail ; avec compte : code ; mot de passe faible 422 ; nouveau 200 ; ancienne session 401 ; ancien mot de passe 401 ; nouveau 200 |
| `typecheck`, `lint`, `build`                | OK                                                                                                                                                                                             |

## 6. Captures d'écran

Aucune : le site est branché au S4-T05.

## 7. Limites connues / dette technique

- Si le compte change pendant la saisie (désactivé, autre réinitialisation), le code est consommé : le client doit recommencer.
- Le site appelle l'API avec sa clé interne : la limite par adresse IP ne s'applique pas encore au visiteur réel (S4-T07).
- Démo : au réveil, le site peut afficher la page d'erreur tant que l'API démarre (S4-T08, page « la boutique se réveille »).

## 8. Prochaines étapes

- **S4-T05** : brancher le site (cookie `HttpOnly`, tickets en cookie, pages « mot de passe oublié », option téléphone « bientôt disponible »).
