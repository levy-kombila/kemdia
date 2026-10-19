# Registre des traitements de données personnelles — Kemdia

> Loi gabonaise n°001/2011 relative à la protection des données à caractère personnel, **modifiée par la loi
> n°025/2023** ; autorité de contrôle : **APDPVP** (ex-CNPDCP). Créé au S7-T08 (ADR-0047). À tenir à jour à chaque
> nouveau traitement ou nouveau destinataire, en même temps que la politique de confidentialité
> (`apps/web/src/components/legal/PrivacyPolicy.tsx`).
>
> Les champs « **à compléter** » attendent la réponse du client (question ouverte n°10, `regles-metier.md`). Rien n'y
> est inventé.

## Responsable des traitements

| Élément                             | Valeur                                                                       |
| ----------------------------------- | ---------------------------------------------------------------------------- |
| Raison sociale, siège, RCCM, NIF    | **à compléter**                                                              |
| Représentant légal                  | **à compléter**                                                              |
| Délégué à la protection des données | **à compléter** (un DPO dispense de déclaration préalable, art. 89)          |
| Déclaration / autorisation APDPVP   | **à compléter** (art. 78 déclaration ; art. 81 si autorisation nécessaire)   |
| Contact pour l'exercice des droits  | **à compléter** (adresse e-mail dédiée)                                      |
| Hébergeur de la production          | **à compléter** (serveur loué hors du Gabon : transfert à déclarer, art. 87) |

## Traitements

| #   | Traitement                      | Finalité                                              | Personnes         | Données                                                                                                                | Base légale                   | Durée de conservation                                                                                              | Destinataires                                     |
| --- | ------------------------------- | ----------------------------------------------------- | ----------------- | ---------------------------------------------------------------------------------------------------------------------- | ----------------------------- | ------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------- |
| T1  | Comptes clients                 | Identifier, sécuriser le compte                       | Clients, vendeurs | Prénom, nom, e-mail ou mobile, empreinte Argon2id, dates d'acceptation des conditions et « 18 ans ou plus »            | Contrat ; consentement (case) | Jusqu'à la suppression ; **3 ans sans connexion** → effacement (avis 30 jours avant)                               | Équipe Kemdia (selon rôle)                        |
| T2  | Sessions et sécurité            | Rester connecté, détecter les abus                    | Tous les comptes  | Empreinte du jeton, navigateur, dates ; journal d'audit : action, adresse IP, courte note de l'équipe (100 caractères) | Intérêt légitime (sécurité)   | Sessions : 30 jours glissants ; journal d'audit : 365 jours, **gardé après la suppression du compte** (ajout seul) | Équipe (administrateurs)                          |
| T3  | Codes à usage unique            | Vérifier un e-mail, changer un mot de passe           | Tous              | Adresse, empreinte du code, essais                                                                                     | Contrat                       | Quelques minutes ; nettoyés chaque heure                                                                           | Brevo (envoi de l'e-mail)                         |
| T4  | Double authentification         | Protéger les comptes de l'équipe                      | Équipe            | Secret TOTP chiffré, codes de secours (empreintes)                                                                     | Intérêt légitime (sécurité)   | Tant que le rôle existe ; effacé avec le compte                                                                    | —                                                 |
| T5  | Panier et commandes             | Vendre, livrer, encaisser, rembourser                 | Clients           | Articles, montants, nom, téléphone et adresse de livraison, numéro Mobile Money                                        | Contrat                       | **10 ans** (comptabilité, OHADA) ; coordonnées **anonymisées** à la suppression du compte                          | Vendeur concerné, livreur, opérateur Mobile Money |
| T6  | Paiements et remboursements     | Encaisser, rembourser, prouver                        | Clients           | Numéro Mobile Money, montant, statut                                                                                   | Contrat ; obligation légale   | 10 ans ; numéro effacé à la suppression du compte                                                                  | Opérateur Mobile Money                            |
| T7  | Factures                        | Obligation comptable                                  | Clients           | Numéro, montants, acheteur (nom, téléphone, adresse), lignes                                                           | Obligation légale (OHADA)     | **10 ans**, gardées **telles qu'émises** même après suppression du compte                                          | Client (e-mail, PDF), comptable                   |
| T8  | Livraisons                      | Suivre l'expédition                                   | Clients           | Ville, étapes, notes de l'équipe                                                                                       | Contrat                       | 10 ans (avec la commande) ; notes effacées à la suppression du compte                                              | Livreur                                           |
| T9  | Boutiques des vendeurs          | Ouvrir une boutique, vendre                           | Vendeurs          | Nom de la boutique, mobile de contact                                                                                  | Contrat                       | Tant que la boutique existe ; mobile effacé à la suppression du compte                                             | Clients (nom de la boutique)                      |
| T10 | Vérification des vendeurs (KYC) | Vérifier l'identité d'un vendeur (BR-024)             | Vendeurs          | Nom, n° de pièce, RCCM, RIB, photos de la pièce (chiffrées AES-256-GCM)                                                | Obligation / intérêt légitime | Photos : **30 jours** après la décision (question n°9) ; dossier effacé avec le compte                             | Administrateurs                                   |
| T11 | E-mails de service              | Codes, avis de sécurité, factures, suivi de livraison | Tous              | Adresse e-mail, contenu du message                                                                                     | Contrat ; intérêt légitime    | Chez Brevo : selon son contrat (**à vérifier**)                                                                    | Brevo (France)                                    |
| T12 | Sauvegardes                     | Reprendre l'activité après un incident                | Tous              | Copie chiffrée des bases                                                                                               | Intérêt légitime (continuité) | Rotation 7 jours / 4 semaines / 6 mois : une donnée effacée disparaît au plus tard en 6 mois                       | Stockage S3 (**à compléter** : fournisseur, pays) |

Pas de profilage, pas de publicité ciblée, pas de cookie de mesure d'audience. Pas de traitement de données
sensibles au sens de la loi (santé, opinions…). Mineurs : Kemdia est réservé aux 18 ans ou plus (case à l'inscription,
art. 74).

## Transferts hors du Gabon (art. 87, à déclarer)

| Vers                        | Quoi                     | Pourquoi                        |
| --------------------------- | ------------------------ | ------------------------------- |
| Hébergeur de la production  | Toutes les données       | Serveur (**à compléter**)       |
| Brevo (France)              | Adresse e-mail, contenu  | Envoi des e-mails               |
| Stockage S3 des sauvegardes | Copie chiffrée           | Sauvegardes (**à compléter**)   |
| Render, Neon (démo)         | Données de démonstration | Démo publique, sans vrai client |

## Droits des personnes

Voir [procedure-demandes-droits.md](procedure-demandes-droits.md). En libre-service dans « Mon compte » : copie JSON
(accès, portabilité) et suppression du compte (effacement).

## Violations de données

Voir [procedure-violation-donnees.md](procedure-violation-donnees.md).

## Mesures de sécurité

HTTPS partout, mots de passe Argon2id, double authentification de l'équipe, pièces d'identité chiffrées, journal
d'audit, sauvegardes chiffrées (restic, AES-256), séparation des réseaux (base sans Internet), revue OWASP ASVS 5.0
niveau 1, OWASP ZAP dans la CI (ADR-0021, 0043 à 0046).
