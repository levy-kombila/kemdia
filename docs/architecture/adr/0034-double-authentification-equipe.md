# ADR-0034 — Double authentification de l'équipe (MED-15)

- **Statut** : Accepté
- **Date** : 2026-10-16
- **Tâche** : S6-T03
- **Remplace en partie** : [ADR-0020](0020-roles-journal-audit.md) (la « connexion de moins de 15 minutes » des routes d'administration)

## Contexte

L'audit de l'ancien site Django (MED-15) demandait un second facteur pour l'équipe. Depuis le S4-T06, une route d'administration
exigeait seulement une connexion de moins de 15 minutes : une session volée (cookie, poste partagé) suffisait. Le S6 ajoute la
modération et les premiers écrans d'équipe : il faut fermer cette porte avant.

Cette tâche repart d'un travail commencé dans la nuit du 2026-10-15 par une autre session, perdu en partie (voir le rapport) : ses
fichiers nouveaux ont été repris, le reste refait. Choix du propriétaire (2026-10-16) :

| Question           | Choix                                                                                                     |
| ------------------ | --------------------------------------------------------------------------------------------------------- |
| Pour qui           | **Modérateurs et administrateurs** (obligatoire) ; ni les vendeurs ni les clients                         |
| Méthode            | **Application d'authentification (TOTP)** : gratuite, sans réseau, aucun coût pour le client              |
| Perte du téléphone | **10 codes de secours** à usage unique + **commande serveur** `mfa:reset`                                 |
| Clé de chiffrement | `TOTP_ENCRYPTION_KEY`, **ajoutée par le propriétaire** (aucun `.env` ni réglage Render touché par Claude) |

## Décision

| Sujet             | Choix                                                                                                                                                                                                                            | Raison                                                                                       |
| ----------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| Routes d'équipe   | `@Authorize(rôle, { secondFactor: true })` sur les 7 contrôleurs d'administration et de modération : session **confirmée par un code il y a moins de 15 minutes**, sinon 403 `DEUX_FACTEURS_A_ACTIVER` ou `DEUX_FACTEURS_REQUIS` | Une session volée ne suffit plus sans le téléphone                                           |
| Confirmation      | Par session (`identity.sessions.second_factor_at`) ; jamais sur une session fermée ; une nouvelle session n'est jamais confirmée                                                                                                 | Un code donné sur un appareil n'ouvre pas les autres                                         |
| TOTP              | RFC 6238 : SHA-1, 6 chiffres, 30 s, ±1 période ; comparaison en temps constant ; **chaque période ne sert qu'une fois** (dernière période gardée, verrou, déclencheur SQL)                                                       | Compatible avec toutes les applications ; pas de rejeu                                       |
| Inscription       | `setup` redemande le **mot de passe** et renvoie le secret (QR code) ; `enable` exige un premier code ; jamais de remplacement d'une 2FA active ; aucune route pour la désactiver                                                | Une session volée ne peut pas inscrire le téléphone de l'attaquant                           |
| Secret            | AES-256-GCM, vecteur aléatoire, UUID du compte en données associées, octet de version ; 49 octets imposés par la base                                                                                                            | Une copie de la base ne donne pas les secrets ; un secret ne s'ouvre pas sur un autre compte |
| Codes de secours  | 10 codes « abcd-efgh-jkmn » (≈ 59 bits) donnés **une fois** ; empreinte SHA-256 liée au compte ; usage unique figé par la base ; renouvelés contre un code **frais** de l'application (pas un code de secours)                   | Pas d'accès durable fabriqué à partir d'un seul code                                         |
| Essais            | 3 échecs en 15 min → **session fermée**, 15 min de blocage ; **10 échecs en 24 h → toutes les sessions fermées** (compteur jamais remis à zéro par une réussite) ; chaque échec au journal (`mfa.failed`)                        | Pas d'essais lents ni discrets (relecture de sécurité)                                       |
| Avis au titulaire | E-mail à l'affichage du QR code, à l'activation, à l'usage d'un code de secours, aux nouveaux codes, au blocage, à la remise à zéro                                                                                              | Une action qui n'est pas de lui se voit tout de suite                                        |
| `mfa:reset`       | Commande serveur (accès à la base = exploitant) : supprime la 2FA, ferme toutes les sessions **et rend le mot de passe inutilisable** ; journal au nom du serveur                                                                | Un voleur qui connaît le mot de passe ne peut pas réinscrire son téléphone (relecture)       |
| Clé               | `TOTP_ENCRYPTION_KEY` (32 octets base64url). Sans elle : clé de développement publique en local et en démo ; ailleurs, 2FA indisponible et **routes d'équipe fermées**                                                           | La production ne démarre jamais l'équipe sans vraie clé                                      |
| Journal           | `mfa.enabled`, `mfa.failed`, `mfa.locked`, `mfa.recovery_used`, `mfa.recovery_regenerated`, `mfa.reset` ; jamais de secret ni de code                                                                                            | Traçabilité                                                                                  |
| Contrat           | 1.16.0 : routes `/api/v1/auth/2fa[/setup\|enable\|verify\|recovery-codes]` ; schémas `SecondFactor*`, `RecoveryCodes` ; codes `DEUX_FACTEURS_*`, `MOT_DE_PASSE_INCORRECT`                                                        | Écrans de l'équipe plus tard au S6                                                           |

## Options écartées

- **Code par e-mail** : une boîte mail compromise suffirait ; consomme le quota Brevo.
- **Code par SMS** : payant (budget du client), SIM échangeable ; l'envoi de SMS est désactivé depuis le S4.
- **2FA pour tous les comptes** : rien ne le demande au MVP ; plus tard, en option pour les vendeurs.
- **Confirmation pour tout le compte** (et pas par session) : un code donné sur un appareil ouvrirait toutes les sessions, dont une volée.

## Conséquences

- ➕ MED-15 traité : une route d'équipe exige le téléphone, en plus de la session.
- ➖ **Avant le déploiement** : ajouter `TOTP_ENCRYPTION_KEY` sur le serveur ; sans elle (hors local et démo), les routes d'équipe restent fermées. Basculer d'un coup (une ancienne instance appliquerait encore l'ancienne règle).
- ➖ Changer la clé rend les secrets illisibles : il faudra un `mfa:reset` par compte (pas de rotation automatique ; l'octet de version la prépare).
- ➖ La toute première inscription se fait avec le mot de passe seul : l'avis « QR code affiché » prévient le titulaire.
- ➖ Après un blocage, le titulaire attend 15 minutes, même juste après une réussite (requêtes simultanées).
- ➖ `RECONNEXION_REQUISE` n'est plus renvoyé ; le code reste dans le contrat pour compatibilité.
