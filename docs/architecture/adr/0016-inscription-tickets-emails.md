# ADR-0016 — Inscription : tickets, pas d'énumération des comptes, e-mails par Mailpit et Brevo

- **Statut** : Accepté
- **Date** : 2026-10-07
- **Tâche** : S4-T02
- **Complète** : [ADR-0015](0015-identite-sessions-otp.md)

## Contexte

L'inscription (FR-001) envoie un code à 6 chiffres à l'adresse e-mail ; le compte n'est actif qu'avec le bon code (BR-041, HIGH-11).
Trois questions restaient ouvertes :

1. **Que répondre quand l'adresse a déjà un compte ?** Répondre « déjà inscrit » permet à n'importe qui de savoir qui est client de Kemdia.
2. **Comment relier la saisie du code à l'inscription qui l'a demandé ?** Le site appelle `verifyOtp(identifiant, code)` : si deux personnes
   s'inscrivent avec la même adresse, le propriétaire de l'adresse pourrait valider sans le savoir le mot de passe choisi par l'autre.
3. **Comment envoyer de vrais e-mails sans budget ?** Render gratuit **bloque les ports SMTP sortants** (25, 465, 587) depuis 2025.

## Décision

| Sujet                     | Choix                                                                                                                                                                                                                                                                                                             | Raison                                                                                                     |
| ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| Adresse déjà utilisée     | **Même réponse** (202, mêmes champs, mêmes limites) ; rien n'est modifié ; le titulaire reçoit une **alerte** « quelqu'un a essayé de s'inscrire avec votre adresse »                                                                                                                                             | Personne ne peut tester si une adresse est cliente ; le titulaire est prévenu (choix du 2026-10-07)        |
| Durée de la réponse       | Le mot de passe est haché (Argon2id) **dans tous les cas**                                                                                                                                                                                                                                                        | Le temps de réponse ne trahit pas l'existence du compte                                                    |
| Lien inscription ↔ code   | **Ticket d'inscription** : 32 octets aléatoires renvoyés par `POST /auth/signup`, exigés par `verify` et `resend` ; la base n'en garde que le SHA-256 ; valable 24 h                                                                                                                                              | Seul celui qui a rempli le formulaire peut terminer SON inscription                                        |
| Création du compte        | Le ticket **porte l'inscription** (prénom, nom, hachage du mot de passe) ; le compte n'est créé, déjà vérifié, qu'au **bon code** ; aucun compte « en attente »                                                                                                                                                   | Une inscription interrompue ou détournée ne laisse rien dans `accounts`                                    |
| Inscriptions concurrentes | Une nouvelle inscription **remplace** le ticket en cours pour la même adresse (une seule à la fois)                                                                                                                                                                                                               | Le code part toujours au vrai titulaire ; l'ancien ticket ne peut plus rien valider                        |
| Compte déjà inscrit       | Ticket **leurre** (sans inscription) : renvoi accepté (rien n'est envoyé), vérification toujours refusée ; mêmes écritures que le cas normal                                                                                                                                                                      | Comportement identique à un vrai ticket, sans aucun effet                                                  |
| Limites, en parallèle     | Limites d'envoi vérifiées et enregistrées **sous verrou** par adresse (`pg_try_advisory_xact_lock` : une demande qui trouve le verrou pris reçoit tout de suite un 429, sans occuper de connexion) ; chaque essai compté par `UPDATE … attempts = attempts + 1 WHERE attempts < 5` ; code consommé une seule fois | Des centaines de demandes simultanées ne contournent ni les 5 essais ni les 60 s (relecture du 2026-10-07) |
| Limites par usage         | Comptées par adresse **et** par usage (inscription, mot de passe oublié)                                                                                                                                                                                                                                          | Des inscriptions malveillantes ne bloquent pas le « mot de passe oublié » du titulaire                     |
| Envoi après la réponse    | L'e-mail part **après** la réponse ; un échec du fournisseur est journalisé (sans clé ni contenu), jamais renvoyé                                                                                                                                                                                                 | Ni la durée d'envoi ni une panne (quota épuisé…) ne trahissent un compte leurre ; réponse plus rapide      |
| Où vit le ticket          | Côté **serveur du site**, dans un cookie `HttpOnly` (S4-T05) ; le navigateur ne le voit jamais                                                                                                                                                                                                                    | Les écrans du S2 restent inchangés (`verifyOtp(identifiant, code)`)                                        |
| Erreurs                   | Problem Details avec un **code stable** (`CODE_INVALIDE`, `CODE_EXPIRE`, `ENVOI_TROP_RAPPROCHE`…) et `Retry-After` pour les limites                                                                                                                                                                               | Le site choisit son message à partir du code, jamais du texte                                              |
| E-mails en local          | **Mailpit** (`docker compose up -d mailpit`, http://localhost:8025) par son **API web** ; par défaut, les codes sont écrits dans le terminal (`console`)                                                                                                                                                          | Rien ne part sur Internet ; aucune dépendance ajoutée                                                      |
| E-mails sur la démo       | **Brevo** offre gratuite (300 e-mails/jour), par son **API HTTP** ; expéditeur vérifié, sans nom de domaine                                                                                                                                                                                                       | SMTP bloqué sur Render gratuit ; Resend gratuit n'envoie qu'au titulaire du compte sans domaine            |
| Choix du moyen d'envoi    | Variable `EMAIL_TRANSPORT` = `console` \| `mailpit` \| `brevo` \| `none` ; `console` **refusé** hors du poste ; `none` par défaut hors du poste                                                                                                                                                                   | Jamais de code dans les journaux d'un serveur                                                              |
| Contenu des e-mails       | Français, texte + HTML simple, **aucun lien ni image** ; le code n'est pas dans le sujet ; aucune donnée saisie par l'utilisateur                                                                                                                                                                                 | Ne ressemble pas à de l'hameçonnage ; rien à injecter                                                      |

## Options écartées

- **Répondre « déjà inscrit »** : simple, mais révèle la liste des clients (choix du 2026-10-07).
- **Redemander le mot de passe à la vérification** : le site devrait garder le mot de passe en mémoire entre deux écrans.
- **Compte « en attente » créé dès l'inscription** (première version) : une réinscription devait réécrire le mot de passe,
  avec des cas de concurrence délicats ; porter l'inscription dans le ticket les supprime.
- **Envoi pendant la requête** (première version) : la durée et les échecs de l'envoi distinguaient un vrai ticket d'un leurre.
- **Nodemailer (SMTP)** pour Mailpit : 16 versions publiées en un mois, sans types fournis ; l'API web de Mailpit suffit.
- **SMTP de Brevo sur Render** : ports bloqués sur l'offre gratuite.
- **Resend** : sans nom de domaine, n'envoie qu'à l'adresse du titulaire du compte Resend.

## Conséquences

- ➕ Aucune réponse ne révèle si une adresse a un compte ; une deuxième inscription ne peut pas détourner la première.
- ➕ Vrais e-mails sur la démo, sans coût ; rien ne part sur Internet depuis le poste de développement.
- ➖ Expéditeur sans domaine (adresse Gmail vérifiée) : certains e-mails peuvent arriver dans les **indésirables** ; un domaine Kemdia (S7) réglera ce point.
- ➖ Quelqu'un peut gêner une inscription en cours en s'inscrivant avec la même adresse (le titulaire recommence), et épuiser
  les 5 codes d'inscription de l'heure pour cette adresse ; c'est le prix de la limite par adresse. Le « mot de passe oublié » n'est pas touché.
- ➖ Brevo garde une copie des e-mails envoyés (donc des codes, valables 10 minutes) : acceptable pour la démo ; à revoir avec le client pour la production.
- ➖ Si le fournisseur d'e-mails est en panne, l'utilisateur n'est pas prévenu : il ne reçoit rien et redemande un code.
  L'équipe le voit dans les journaux (`envoi email vers … impossible`) ; une alerte sur cette ligne est prévue avec la surveillance (S7).
- ➖ Les tickets et codes expirés ne sont pas encore nettoyés (S4-T03, avec les sessions).
