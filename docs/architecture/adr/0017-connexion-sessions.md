# ADR-0017 — Connexion, sessions et blocage neutre

- **Statut** : Accepté
- **Date** : 2026-10-08
- **Tâche** : S4-T03
- **Complète** : [ADR-0015](0015-identite-sessions-otp.md), [ADR-0016](0016-inscription-tickets-emails.md)

## Contexte

Le client se connecte avec son e-mail (ou, plus tard, son téléphone) et son mot de passe (FR-004).
Après 3 échecs, la connexion est bloquée 15 minutes (BR-040). L'ADR-0015 a choisi des sessions en base et un cookie posé par le site.
Restaient trois choix, faits le 2026-10-08 : la **durée** d'une session, la **connexion après l'inscription**, et le **message** en cas de blocage.

## Décision

| Sujet               | Choix                                                                                                                                                                            | Raison                                                                                           |
| ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| Durée               | **30 jours glissants** : chaque visite repousse la fin, au plus une écriture par heure                                                                                           | Pratique sur téléphone ; une session abandonnée meurt seule                                      |
| Après le bon code   | Le client est **connecté directement** (`/signup/verify` renvoie une session)                                                                                                    | Il vient de prouver qu'il a l'adresse et a choisi son mot de passe                               |
| Blocage (BR-040)    | Compté **par identifiant, compte ou pas** (table `login_guards`) ; message neutre « identifiant ou mot de passe incorrect », puis « trop d'essais, réessayez dans 15 min » (429) | Personne ne peut tester si une adresse est cliente                                               |
| Essais simultanés   | Chaque tentative **réserve un essai** en une requête (`INSERT … ON CONFLICT DO UPDATE`) **avant** de vérifier le mot de passe                                                    | 30 tentatives envoyées ensemble ne vérifient que 3 mots de passe (test sur PostgreSQL)           |
| Fenêtre             | Les essais s'oublient après **15 minutes sans tentative** ; une connexion réussie remet le compteur à zéro, **sauf** si un blocage a été posé en parallèle                       | « 3 échecs rapprochés » ; une réussite ne rend pas d'essais à un attaquant                       |
| Adresse sans compte | Le mot de passe est comparé à un **hachage factice** (Argon2id, mêmes réglages, constant)                                                                                        | Même durée de réponse ; aucun calcul à l'exécution, donc aucun échec qui trahirait quelque chose |
| Compte désactivé    | Message à part **seulement** avec le bon mot de passe                                                                                                                            | Le titulaire sait quoi faire ; un inconnu n'apprend rien                                         |
| Jeton               | 32 octets aléatoires remis une fois ; la base garde le SHA-256 ; en-tête `Authorization: Bearer` du site vers l'API                                                              | Une copie de la base ne permet pas d'ouvrir une session                                          |
| Déconnexion         | Révocation immédiate (`/auth/logout`), « tous mes appareils » (`/auth/logout-all`) ; un compte désactivé perd toutes ses sessions                                                | Un JWT ne se révoque pas : c'est la raison du choix « sessions en base » (ADR-0015)              |
| Autres modules      | `SessionGuard` et `@CurrentSession()` exportés par le module identity                                                                                                            | Les commandes (S5) protègent leurs routes sans connaître les sessions                            |
| Ménage              | Une fois par heure : sessions expirées ou fermées depuis un jour, codes de plus d'un jour, tickets expirés, compteurs inactifs                                                   | Les tables ne grossissent pas ; rien d'utile n'est supprimé                                      |

## Options écartées

- **Bloquer le compte** (colonnes `failed_logins` / `locked_until` du S4-T01) : ne protège pas une adresse sans compte, donc le blocage révèle qui est client. Les colonnes restent pour l'instant (retour arrière possible) et seront supprimées au S4-T08.
- **Compter les échecs après la vérification du mot de passe** : des tentatives simultanées passent toutes avant que le premier échec soit enregistré.
- **Session jusqu'à la fermeture du navigateur / case « Rester connecté »** : écartées le 2026-10-08.

## Conséquences

- ➕ Aucune réponse, aucune durée, aucun blocage ne distingue une adresse inconnue d'un mauvais mot de passe.
- ➕ Les autres modules disposent d'une protection de route prête à l'emploi.
- ➖ N'importe qui peut bloquer la connexion d'une adresse 15 minutes en envoyant 3 mauvais mots de passe (inhérent à BR-040). Le « mot de passe oublié » (S4-T04) lèvera le blocage, et la limite par visiteur arrive au S4-T07.
- ➖ Chaque page connectée lit la table `sessions` (index unique) ; une écriture par heure au plus.
- ➖ Le ménage tourne dans l'API (une seule instance au MVP) ; à revoir si plusieurs instances (S7).
