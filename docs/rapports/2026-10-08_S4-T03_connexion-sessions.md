# Rapport — S4-T03 : connexion, sessions et déconnexion

|                                                 |                   |
| ----------------------------------------------- | ----------------- |
| **Date**                                        | 2026-10-08        |
| **Sprint / tâches**                             | S4 — S4-T03       |
| **Version**                                     | v0.4.0 (en cours) |
| **Sections du cahier d'architecture modifiées** | §3.7, §3.9, §6.3  |

## 1. Résumé

Le client peut maintenant **se connecter** avec son e-mail et son mot de passe, **rester connecté 30 jours** (prolongés à chaque
visite) et **se déconnecter**, sur un appareil ou sur tous. Après le bon code d'inscription, il est **connecté directement**.
Après 3 essais ratés, la connexion attend 15 minutes (BR-040), avec un message neutre : rien ne révèle si une adresse a un compte.
Le site sera branché sur ces routes au S4-T05.

Avant cette tâche, l'envoi d'e-mails de la démo a été activé (Brevo, réglages Render du 2026-10-08) et vérifié par une vraie inscription.

## 2. Fonctionnalités livrées

| Élément                            | Ce que ça fait                                                                            | Fichiers principaux                            |
| ---------------------------------- | ----------------------------------------------------------------------------------------- | ---------------------------------------------- |
| `POST /auth/login`                 | Connexion ; renvoie un jeton de session et le compte                                      | `login.service.ts`, `identity.controller.ts`   |
| Blocage BR-040                     | 3 essais en 15 minutes, puis 15 minutes d'attente ; compté par identifiant, compte ou pas | `domain/login-guard.ts`, `prisma-login-guard…` |
| `POST /auth/signup/verify`         | Crée le compte **et** ouvre la session                                                    | `signup.service.ts`                            |
| `GET /auth/session`                | La session est-elle valable ? La prolonge (au plus une fois par heure)                    | `session.service.ts`                           |
| `POST /auth/logout`, `/logout-all` | Ferme cette session, ou toutes celles du compte                                           | `session.service.ts`                           |
| `SessionGuard`                     | Protection de route prête pour les commandes (S5) et l'espace vendeur (S6)                | `interface/session.guard.ts`                   |
| Ménage horaire                     | Supprime sessions, codes, tickets et compteurs périmés                                    | `infrastructure/identity-maintenance.ts`       |
| Base                               | Table `identity.login_guards`, index sur la fin des sessions                              | migration `…_connexion`                        |
| Contrat                            | `LoginRequest`, `OpenedSession`, `CurrentSession`, `AccountView`… ; OpenAPI 1.3.0         | `packages/contracts`, `docs/api/openapi.json`  |

## 3. Décisions techniques

[ADR-0017](../architecture/adr/0017-connexion-sessions.md), avec tes trois choix du 2026-10-08 : **30 jours glissants**,
**connecté directement après le code**, **message neutre** en cas de blocage.

Le blocage est compté par **identifiant** (table `login_guards`) et non plus sur le compte : sinon une adresse sans compte ne serait
jamais bloquée, et le blocage révélerait qui est client. Les anciennes colonnes du compte restent (retour arrière possible) ;
elles seront supprimées au S4-T08.

## 4. Sécurité

- **Essais simultanés** : chaque tentative réserve un essai en base **avant** la vérification du mot de passe.
  Test sur PostgreSQL : 30 tentatives envoyées ensemble ne vérifient que 3 mots de passe au plus.
- **Pas d'énumération** : même statut, même message, même blocage et même durée (hachage factice Argon2id, constant)
  pour une adresse sans compte ; vérifié par un test qui compare les 4 réponses des deux cas.
- **Sessions** : jeton de 256 bits remis une fois, seule son empreinte est en base ; fermeture immédiate ;
  un compte désactivé perd ses sessions ; jeton jamais dans les journaux (essai réel).
- **Relecture indépendante** (second agent) : aucun défaut critique ; 4 points corrigés avant la PR :
  1. un test de concurrence ne vérifiait pas assez strictement le nombre de mots de passe testés ;
  2. le hachage factice, calculé à la demande, aurait pu échouer et trahir les adresses sans compte → valeur constante ;
  3. une connexion réussie pouvait effacer un blocage posé en parallèle par d'autres tentatives → plus maintenant ;
  4. les essais ratés ne s'oubliaient jamais → fenêtre de 15 minutes.
- Audit de l'ancien site : **HIGH-11**, **HIGH-15** et **MED-10** passent à ✅.

## 5. Qualité

| Vérification                                | Résultat                                                                                                      |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| Tests unitaires de l'API                    | 284 (23 nouveaux) : blocage, connexion, sessions, routes HTTP, hachage factice                                |
| Tests d'intégration (vraie base PostgreSQL) | 52 (8 nouveaux), dont la connexion en parallèle et le ménage                                                  |
| Essai réel                                  | Inscription → session, 4 mauvais essais (2 × 401 puis 2 × 429), adresse inconnue identique, déconnexion → 401 |
| `typecheck`, `lint`, `build`                | OK                                                                                                            |

## 6. Captures d'écran

Aucune : le site est branché au S4-T05.

## 7. Limites connues / dette technique

- N'importe qui peut bloquer la connexion d'une adresse 15 minutes avec 3 mauvais mots de passe (inhérent à BR-040).
  **S4-T04** : le « mot de passe oublié » devra lever ce blocage et fermer toutes les sessions.
- Le site appelle l'API avec sa clé interne : la limite par adresse IP ne s'applique pas encore au visiteur réel (S4-T07).
- `X-Kemdia-User-Agent` est accepté de tout appelant (affichage seulement, nettoyé).
- Le ménage tourne dans l'API (une seule instance au MVP).
- Colonnes `failed_logins` / `locked_until` du compte inutilisées : à supprimer au S4-T08.

## 8. Prochaines étapes

- **S4-T04** : mot de passe oublié (code par e-mail, nouveau mot de passe, déblocage, fermeture des sessions).
- **S4-T05** : brancher le site (cookie `HttpOnly`, option téléphone « bientôt disponible »).
