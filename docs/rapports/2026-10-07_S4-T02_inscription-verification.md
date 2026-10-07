# Rapport — S4-T02 : inscription et vérification par code

|                                                 |                        |
| ----------------------------------------------- | ---------------------- |
| **Date**                                        | 2026-10-07             |
| **Sprint / tâches**                             | S4 — S4-T02            |
| **Version**                                     | v0.4.0 (en cours)      |
| **Sections du cahier d'architecture modifiées** | §3.4, §3.7, §3.9, §6.3 |

## 1. Résumé

L'API sait maintenant **inscrire un client**. Elle envoie un code à 6 chiffres par e-mail et remet un **ticket** à celui qui a rempli
le formulaire. Le compte n'est créé, déjà vérifié, que quand le bon code revient avec ce ticket (BR-041).
Aucune réponse ne révèle si une adresse a déjà un compte : le vrai titulaire reçoit alors une alerte.
Les e-mails partent dans le terminal ou dans **Mailpit** sur le poste, et par **Brevo** (gratuit) sur la démo,
une fois les réglages ajoutés sur Render.

## 2. Fonctionnalités livrées

| Élément                    | Ce que ça fait                                                                                       | Fichiers principaux                                       |
| -------------------------- | ---------------------------------------------------------------------------------------------------- | --------------------------------------------------------- |
| `POST /auth/signup`        | Vérifie les données, envoie le code, renvoie un **ticket** qui porte l'inscription                   | `interface/identity.controller.ts`, `signup.service.ts`   |
| `POST /auth/signup/verify` | Ticket + bon code → compte créé, déjà vérifié                                                        | idem                                                      |
| `POST /auth/signup/resend` | Nouveau code (60 s entre deux, 5 par heure) ; l'ancien ne vaut plus rien                             | idem                                                      |
| Adresse déjà inscrite      | Même réponse, alerte au titulaire, rien n'est modifié, ticket « leurre » qui ne valide rien          | `signup.service.ts`, `otp.service.ts`                     |
| Limites, en parallèle      | Essais comptés en une requête ; limites d'envoi sous verrou par adresse et par usage                 | `prisma-otp-challenge.repository.ts`                      |
| E-mails                    | Modèles en français sans lien ; envoi après la réponse ; console, **Mailpit** ou **Brevo** (API web) | `infrastructure/email/`, `otp-sender.factory.ts`          |
| Erreurs                    | Code stable (`CODE_INVALIDE`, `CODE_EXPIRE`…) et `Retry-After` dans les réponses d'erreur            | `http/business-exception.ts`, `problem-details.filter.ts` |
| Contrat                    | Schémas d'inscription et liste des codes d'erreur partagés avec le site ; OpenAPI 1.2.0              | `packages/contracts`, `docs/api/openapi.json`             |
| Base                       | Table `identity.signup_tickets` (empreinte du ticket, inscription ou rien)                           | migration `…_tickets_inscription`                         |
| Poste de développement     | Service `mailpit` dans `docker-compose.yml` (http://localhost:8025)                                  | `docker-compose.yml`                                      |

## 3. Décisions techniques

[ADR-0016](../architecture/adr/0016-inscription-tickets-emails.md), avec tes trois choix du 2026-10-07 : **Brevo** pour la démo,
**même réponse + alerte** pour une adresse déjà inscrite, **activation sur la démo** dans cette tâche.

- Render gratuit bloque l'envoi SMTP : la démo passe par l'**API web** de Brevo. Pour Mailpit aussi, l'API web :
  aucune dépendance ajoutée (la bibliothèque SMTP habituelle changeait trop souvent et n'a pas ses propres types).
- Le **ticket** relie la saisie du code à l'inscription ; au S4-T05, le serveur du site le gardera dans un cookie `HttpOnly`.

## 4. Sécurité

Une **relecture indépendante** (un second agent qui n'avait pas écrit le code) a trouvé des défauts dans la première version, tous corrigés :

| Défaut trouvé                                                                                                                 | Correction                                                                              |
| ----------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| **Grave** : des centaines d'essais de code envoyés en même temps ne comptaient que pour un ; un code devenait devinable       | Essai compté dans la base en une requête (`attempts = attempts + 1 WHERE attempts < 5`) |
| Demandes de code simultanées : la limite de 60 s pouvait être franchie (bombardement d'e-mails)                               | Vérification et enregistrement sous verrou par adresse                                  |
| Le renvoi sur un ticket « leurre » était plus rapide et ne tombait jamais en panne : on pouvait deviner qu'un compte existait | L'e-mail part après la réponse, pour tous                                               |
| Des inscriptions malveillantes pouvaient bloquer le « mot de passe oublié » du titulaire                                      | Limites comptées par usage                                                              |
| Cas de concurrence où une réinscription aurait pu valider un autre mot de passe                                               | Le compte n'est créé qu'au bon code, avec les données du ticket vérifié                 |

Les tests de concurrence sur une vraie base le prouvent : 20 essais simultanés donnent 4 « code incorrect » puis « trop d'essais » ;
10 demandes de code simultanées n'en laissent passer qu'une.

Et aussi :

- Pas d'énumération des comptes : même statut, mêmes champs, mêmes limites, mêmes écritures ; mot de passe haché dans tous les cas.
- Mot de passe, ticket et code jamais dans les journaux (vérifié sur une API lancée pour de vrai) ; filet de sécurité des journaux complété.
- Clé Brevo : secret de Render uniquement, jamais affichée (ni dans les erreurs de configuration ni dans les journaux d'envoi).
- `console` refusé hors du poste ; Mailpit refusé en production ; aucun envoi par défaut sur un serveur.
- HIGH-11 (connexion avant vérification) : sans le bon code, aucun compte n'existe.

## 5. Qualité

| Vérification                                | Résultat                                                                                     |
| ------------------------------------------- | -------------------------------------------------------------------------------------------- |
| Tests unitaires de l'API                    | 262 (36 nouveaux) : inscription, codes, e-mails, configuration, routes HTTP                  |
| Tests d'intégration (vraie base PostgreSQL) | 47 (7 nouveaux), dont 3 de **concurrence** (essais, bons codes, demandes de code simultanés) |
| Contrat                                     | Chaque réponse confrontée aux schémas ; chaque code d'erreur du contrat a un statut HTTP     |
| Essai réel                                  | API lancée, inscription par `curl`, code lu dans le terminal, mauvais code 422, bon code 200 |
| `typecheck`, `lint`, `build`, site          | OK (le site n'est pas modifié ; ses 143 tests passent)                                       |

## 6. Captures d'écran

Aucune : le site n'est branché qu'au S4-T05.

## 7. Limites connues / dette technique

- Si Brevo est en panne, l'utilisateur ne reçoit rien et n'est pas prévenu (il redemande un code) ; l'équipe le voit dans les journaux.
- E-mails envoyés depuis une adresse Gmail vérifiée : risque d'arriver dans les **indésirables** tant qu'il n'y a pas de domaine Kemdia (S7).
- Brevo garde une copie des e-mails envoyés (codes valables 10 minutes) : acceptable pour la démo, à revoir pour la production.
- Le serveur du site n'est pas limité par adresse IP (clé interne) : la vraie adresse du visiteur sera transmise au S4-T07.
- Tickets et codes expirés pas encore nettoyés (S4-T03).
- Quelqu'un peut gêner une inscription en cours en réutilisant l'adresse (le titulaire recommence) ; limité à 5 envois par heure.

## 8. Prochaines étapes

- **Toi** : après la fusion, suivre le [guide e-mails](../guides/emails.md) (compte Brevo, expéditeur, clé, 3 réglages sur Render),
  puis l'essai de l'étape E.
- **S4-T03** : connexion, sessions, déconnexion, blocage après 3 échecs (BR-040).
