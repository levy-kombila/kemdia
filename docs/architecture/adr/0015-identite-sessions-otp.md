# ADR-0015 — Identité : sessions en base, Argon2id, codes à usage unique, SMS différé

- **Statut** : Accepté
- **Date** : 2026-10-07
- **Tâche** : S4-T01

## Contexte

Le Sprint 4 construit le module `identity` : inscription par e-mail **ou** téléphone avec un code à 6 chiffres (BR-041),
connexion, blocage après 3 échecs (BR-040), mot de passe oublié (FR-012). Le site a déjà les écrans (S2-T01), branchés sur
un adaptateur de démonstration (code `123456`).

Contraintes du projet :

- **Aucun budget** pour l'instant : pas de SMS payants, pas de Redis payant, la démo reste sur Render Free + Neon Free.
- Le **client** (titulaire du compte bancaire) choisira plus tard le fournisseur SMS (note d'une page qui lui est remise).
- L'ancien projet Django avait des sessions et des jetons mal protégés (audit : HIGH-11, HIGH-16, MED-05).

## Décision

| Sujet                  | Choix                                                                                                                                                                                                    | Raison                                                                                                                           |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| Sessions               | **Table `identity.sessions`** + cookie `HttpOnly; Secure; SameSite=Lax` posé par le **site** (le navigateur ne parle qu'au site, le site relaie vers l'API — « BFF »). Branchées au S4-T03               | Déconnexion immédiate et « déconnecter mes appareils » possibles (un JWT ne se révoque pas) ; aucun jeton lisible par JavaScript |
| Jeton de session       | 32 octets aléatoires dans le cookie ; la base ne garde que leur **SHA-256** (`token_hash`, unique)                                                                                                       | Une copie de la base ne permet pas d'ouvrir une session                                                                          |
| Mots de passe          | **Argon2id** (`@node-rs/argon2`, binaire précompilé, aucun script d'installation), réglages OWASP : 19 Mio, 2 passes, 1 fil                                                                              | Recommandation OWASP actuelle ; réglages inscrits dans le hachage, donc relevables plus tard                                     |
| Règles de mot de passe | 8 à 128 caractères, une lettre et un chiffre, liste de mots de passe courants (plus longue que celle du site)                                                                                            | NIST SP 800-63B ; mêmes règles que le site (test d'alignement)                                                                   |
| Codes à usage unique   | 6 chiffres (`crypto.randomInt`), **10 min**, **5 essais**, seul le **dernier** code envoyé compte ; enregistré sous forme d'empreinte SHA-256(identifiant du défi + code), comparaison en temps constant | Un code volé dans la base est inutilisable ; un ancien code ne redevient jamais valable                                          |
| Limites d'envoi        | 60 s entre deux codes, **5 par heure** vers une même adresse ou un même numéro, comptés dans la table `otp_challenges`                                                                                   | Coût des SMS, harcèlement d'un numéro ; pas de Redis à payer ni à exploiter                                                      |
| Compteurs et blocages  | **PostgreSQL seulement** (colonnes `failed_logins`, `locked_until`, table `otp_challenges`)                                                                                                              | Une seule base à sauvegarder ; volume faible au MVP (Redis réexaminé si besoin au S7)                                            |
| Envoi des codes        | Port **`OtpSender`** : console sur le poste de développement **seulement** ; e-mail au S4-T02 (Mailpit en local, offre gratuite Brevo ou Resend sur la démo) ; SMS quand le client aura choisi           | Jamais de code dans les journaux de la démo ou de la production ; le fournisseur se change sans toucher au reste                 |
| SMS                    | Variable **`SMS_ENABLED`** (`false` par défaut) : l'API refuse d'envoyer un SMS (`CANAL_INDISPONIBLE`) ; le site affichera l'option téléphone « bientôt disponible » (S4-T05)                            | Pas de budget aujourd'hui ; activer le SMS = un adaptateur + une variable, sans migration                                        |
| Identifiants           | E-mail en minuscules, mobile gabonais `+2410[67]XXXXXXX` ; **uniques** ; contraintes SQL en plus du domaine (au moins un identifiant, format, compte actif ⇒ identifiant vérifié)                        | BR-041 garanti même en cas d'erreur de code                                                                                      |

## Options écartées

- **JWT dans le navigateur** (localStorage ou cookie lisible) : vol par XSS, impossible à révoquer avant expiration.
- **Redis** pour les sessions et compteurs : un service de plus à payer, sauvegarder et surveiller, pour quelques milliers de comptes.
- **bcrypt** : limite à 72 octets, moins résistant aux cartes graphiques qu'Argon2id.
- **SMS d'essai gratuits** (crédits d'essai Twilio…) : numéros vérifiés à la main seulement, expéditeur non reconnu au Gabon ; la note au client compare les offres.

## Conséquences

- ➕ Inscription, vérification et connexion se testent gratuitement (console en local, e-mail sur la démo).
- ➕ Le SMS s'active plus tard sans changer le schéma de la base ni les écrans.
- ➖ Chaque requête connectée lit la table `sessions` (index unique sur `token_hash`) : acceptable au MVP, à mesurer au S7.
- ➖ Deux demandes simultanées peuvent passer ensemble la limite de 60 s (pas de verrou) : effet limité, revu au S4-T07 avec la limite par compte.
- ➖ Tant que le SMS n'est pas actif, un client sans adresse e-mail ne peut pas s'inscrire.
