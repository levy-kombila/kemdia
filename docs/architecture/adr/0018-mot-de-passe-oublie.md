# ADR-0018 — Mot de passe oublié

- **Statut** : Accepté
- **Date** : 2026-10-08
- **Tâche** : S4-T04
- **Complète** : [ADR-0015](0015-identite-sessions-otp.md), [ADR-0016](0016-inscription-tickets-emails.md), [ADR-0017](0017-connexion-sessions.md)

## Contexte

Un client qui a oublié son mot de passe doit pouvoir en choisir un nouveau (FR-012), sans lien dans l'e-mail
(les e-mails Kemdia n'ont ni lien ni image, ADR-0016) et sans que la page révèle qui a un compte.
Deux choix ont été faits le 2026-10-08 :

- **Après le changement** : le client est **connecté sur cet appareil et déconnecté partout ailleurs**.
- **Adresse sans compte** : **même réponse, aucun e-mail** (contrairement à l'inscription, il n'y a pas d'alerte à envoyer).

## Décision

Parcours en trois routes, sur le modèle de l'inscription :

1. `POST /auth/password/forgot` `{ identifier }` → **202** `{ ticket, channel, sentTo, resendInSeconds }`.
2. `POST /auth/password/resend` `{ ticket }` → **202**, nouveau code (60 s entre deux, 5 par heure).
3. `POST /auth/password/reset` `{ ticket, code, newPassword }` → **200**, session ouverte (même réponse que la connexion).

| Sujet                           | Choix                                                                                                                                                                                                                                       | Raison                                                                                                      |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| Preuve                          | **Ticket** (32 octets, empreinte SHA-256 en base, 1 h) + **code** à 6 chiffres (10 min, 5 essais, dernier code seul valable)                                                                                                                | Le code seul (1 chance sur 1 million) ne suffit pas : il faut aussi le ticket remis au navigateur du client |
| Adresse sans compte             | Même réponse, mêmes limites d'envoi, **aucun e-mail** ; un **ticket leurre** (sans compte) est enregistré ; aucun code ne le valide                                                                                                         | Rien ne distingue une adresse cliente ; personne ne reçoit d'e-mail non sollicité                           |
| Compte désactivé                | Traité comme une adresse sans compte                                                                                                                                                                                                        | Un compte fermé ne se rouvre pas par cette voie                                                             |
| Mot de passe trop faible        | Vérifié **avant** le code                                                                                                                                                                                                                   | Une faute de frappe ne coûte pas un des 5 essais                                                            |
| Changement                      | **Une transaction** : nouveau hachage et **version du mot de passe +1** (seulement si le compte est actif et à la version lue), tickets supprimés, **toutes les sessions fermées**, blocage BR-040 levé (e-mail **et** téléphone du compte) | Jamais d'état à moitié appliqué (mot de passe changé mais anciennes sessions encore ouvertes)               |
| Connexion pendant le changement | Chaque session garde la **version du mot de passe** lue avec le hachage vérifié ; une session d'une autre version est refusée                                                                                                               | Une connexion commencée avec l'ancien mot de passe juste avant le changement n'ouvre rien d'utilisable      |
| Après le changement             | Session ouverte sur cet appareil ; e-mail « Votre mot de passe a été modifié » (sans lien) au titulaire                                                                                                                                     | Choix du 2026-10-08 ; le titulaire est prévenu si ce n'était pas lui                                        |
| Nouvelle demande                | Remplace la précédente (un seul ticket par adresse)                                                                                                                                                                                         | Un vieux ticket ne traîne pas                                                                               |
| Adresse changée entre-temps     | Refus si l'adresse du ticket n'appartient plus au compte                                                                                                                                                                                    | Prépare le changement d'adresse (plus tard)                                                                 |
| Téléphone                       | « Bientôt disponible » tant que `SMS_ENABLED=false`                                                                                                                                                                                         | Pas de fournisseur SMS choisi (pas de budget)                                                               |

## Options écartées

- **Lien dans l'e-mail** : contraire à la règle « e-mails sans lien » (hameçonnage) ; le code se tape sur la page Kemdia.
- **Alerte à une adresse sans compte** (« quelqu'un a demandé… ») : écartée le 2026-10-08 ; inutile et peut servir à envoyer des e-mails à n'importe qui.
- **Garder les autres sessions ouvertes** : un voleur qui connaissait l'ancien mot de passe resterait connecté.
- **Date de changement comparée à la date de création de la session** : une connexion qui a lu l'ancien hachage peut créer sa session _après_ le changement ; la version, lue dans la même ligne que le hachage, n'a pas ce défaut.

## Conséquences

- ➕ Le parcours ne révèle pas qui est client (mêmes réponses, mêmes limites, mêmes erreurs avec un ticket leurre — vérifié par les tests).
- ➕ Le mot de passe oublié lève le blocage BR-040 (ADR-0017) : un client bloqué par un inconnu reprend la main.
- ➕ Une seule réinitialisation réussit avec un code, même envoyée plusieurs fois en même temps (test sur PostgreSQL).
- ➖ Si le compte change pendant la saisie (désactivé, autre réinitialisation), le code est consommé et le client doit recommencer ; message « code incorrect ».
- ➖ Chaque vérification de session compare une version de plus (même ligne de compte déjà lue : aucun coût).
- ➖ L'envoi de l'e-mail démarre avant la réponse quand un compte existe : écart de moins d'une milliseconde, noyé dans le temps de la base (accepté).
