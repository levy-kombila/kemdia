# Rapport — S4-T01 : fondations du module `identity`

|                                                 |                                               |
| ----------------------------------------------- | --------------------------------------------- |
| **Date**                                        | 2026-10-07                                    |
| **Sprint / tâches**                             | S4 — S4-T01                                   |
| **Version**                                     | v0.4.0 (en cours)                             |
| **Sections du cahier d'architecture modifiées** | §3.4, §3.5, §3.9 (nouvelle), §5.4, §6.3, §6.4 |

## 1. Résumé

Premières briques des comptes clients, **sans encore aucune route** : le serveur sait maintenant reconnaître un identifiant
(e-mail ou mobile gabonais), juger un mot de passe, le hacher en Argon2id, créer et vérifier un code à 6 chiffres,
et compter les échecs de connexion (BR-040). Les tables du schéma `identity` sont créées par une nouvelle migration.
Le SMS est prévu mais **désactivé** (`SMS_ENABLED=false`) en attendant la décision du client.

## 2. Fonctionnalités livrées

| Élément             | Ce que ça fait                                                                                             | Fichiers principaux                                     |
| ------------------- | ---------------------------------------------------------------------------------------------------------- | ------------------------------------------------------- |
| Identifiant         | E-mail en minuscules ou `+2410[67]XXXXXXX` ; mêmes réponses que le site                                    | `domain/identifier.ts`                                  |
| Mot de passe et nom | 8 à 128 caractères, lettre + chiffre, liste de mots de passe courants ; prénom et nom de 2 à 60 lettres    | `domain/password-policy.ts`                             |
| Compte              | En attente → actif après vérification (BR-041) ; 3 échecs → bloqué 15 min (BR-040)                         | `domain/account.ts`                                     |
| Code à usage unique | 6 chiffres, 10 min, 5 essais, empreinte seulement, dernier code seul valable                               | `domain/otp.ts`, `application/otp.service.ts`           |
| Limites d'envoi     | 60 s entre deux codes, 5 par heure par adresse ou numéro, comptés dans PostgreSQL                          | `application/otp.service.ts`                            |
| Hachage             | Argon2id, 19 Mio, 2 passes (`@node-rs/argon2`, binaire précompilé, pas de script d'installation)           | `infrastructure/argon2-password-hasher.ts`              |
| Envoi des codes     | Console sur le poste de développement ; aucun envoi ailleurs (démo, production) jusqu'à l'e-mail du S4-T02 | `infrastructure/otp-sender.factory.ts`                  |
| Base de données     | Schéma `identity` : `accounts`, `otp_challenges`, `sessions` + contraintes SQL                             | `prisma/schema/identity.prisma`, migration `…_identite` |
| Configuration       | `SMS_ENABLED` (`false` par défaut)                                                                         | `config/env.ts`, `.env.example`                         |

## 3. Décisions techniques

[ADR-0015](../architecture/adr/0015-identite-sessions-otp.md) : sessions en base + cookie posé par le site, Argon2id, conception des codes,
compteurs dans PostgreSQL (pas de Redis), SMS derrière un port et une variable.

**Changement de découpage** : l'envoi réel par e-mail (Mailpit en local, offre gratuite Brevo ou Resend sur la démo) passe au **S4-T02**,
avec l'inscription qui en a besoin. Avant de créer le compte chez le fournisseur et d'ajouter les variables sur Render,
la marche à suivre sera expliquée et validée avec toi.

## 4. Sécurité

- Faille corrigée **pendant le développement** : la première version cherchait « le dernier code encore utilisable » ; après utilisation
  du nouveau code, l'ancien redevenait valable. Le test d'intégration l'a montré ; on vérifie maintenant **toujours le dernier code envoyé**.
- Codes et jetons jamais enregistrés en clair (empreinte SHA-256), comparaison en temps constant.
- Aucun code dans les journaux hors du poste de développement (test dédié).
- La base refuse seule un compte sans identifiant, un e-mail en majuscules, un numéro mal formé, un compte actif non vérifié (BR-041).
- Préparation de HIGH-11 (connexion avant vérification) : la règle est dans le domaine et dans la base ; la route arrive au S4-T02/T03.

## 5. Qualité

| Vérification                                | Résultat                                                                                                    |
| ------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| Tests unitaires de l'API                    | 226 (dont 82 nouveaux : domaine, codes, hachage, envoi, alignement, configuration)                          |
| Tests d'intégration (vraie base PostgreSQL) | 40, dont 5 nouveaux : relecture à l'identique, unicité, BR-040, contraintes SQL, parcours de code           |
| Alignement site / API                       | Nouveau test `identity-alignment` : identifiants, mots de passe, noms, réglages des codes                   |
| Architecture et schéma Prisma               | Règles respectées (domaine sans framework, un schéma par module, aucune relation entre modules)             |
| `typecheck`, `lint`, `build`                | OK                                                                                                          |
| Migration                                   | Écrite à la main (moteur Prisma indisponible ici) ; la CI vérifie qu'elle correspond au schéma (`db:check`) |

## 6. Captures d'écran

Aucune : pas de changement visible sur le site dans cette tâche.

## 7. Limites connues / dette technique

- Deux demandes de code **au même instant** peuvent passer ensemble la limite de 60 s (pas de verrou) : à revoir au S4-T07.
- Tant que le SMS n'est pas actif, un client **sans adresse e-mail** ne peut pas s'inscrire.
- Les anciens codes et sessions expirés ne sont pas encore nettoyés (tâche de ménage prévue avec les sessions, S4-T03).

## 8. Prochaines étapes

- **S4-T02** : inscription + vérification par code, adaptateur e-mail (Mailpit en local ; fournisseur gratuit sur la démo, après ton accord).
- Côté client : décision sur le fournisseur SMS (voir la note d'une page).
- **Rien à changer** dans ton fichier `.env` ni sur Render pour cette tâche : `SMS_ENABLED` vaut `false` par défaut.
