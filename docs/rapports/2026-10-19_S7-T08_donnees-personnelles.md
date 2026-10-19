# Rapport — S7-T08 : conformité APDPVP (données personnelles)

|                                                 |                                      |
| ----------------------------------------------- | ------------------------------------ |
| **Date**                                        | 2026-10-19                           |
| **Sprint / tâches**                             | S7 — S7-T08                          |
| **Version**                                     | v0.7.0 → (v0.8.0 à la clôture du S7) |
| **Sections du cahier d'architecture modifiées** | §3.23 (nouvelle) — version 4.14      |

## 1. Résumé

Kemdia respecte maintenant les droits que donne la **loi n°001/2011 modifiée par la loi n°025/2023** (autorité :
APDPVP) :

- dans « Mon compte », le client **télécharge une copie de ses données** (fichier JSON) et peut **supprimer son
  compte** (mot de passe exigé) ;
- la suppression est refusée tant qu'une commande, un paiement, un remboursement ou une boutique est en cours ;
- les **commandes sont anonymisées** ; seules les **factures restent 10 ans** telles qu'émises (obligation OHADA) ;
- un compte **sans connexion depuis 3 ans est effacé**, après un e-mail d'avis 30 jours avant ;
- l'inscription demande une case **« J'ai 18 ans ou plus »**, distincte des conditions ;
- **politique de confidentialité** et **mentions légales** réécrites ; **registre des traitements** et deux
  procédures (demandes de droits, fuite de données) dans `docs/conformite/`.

Les informations que seul le client peut donner (raison sociale, RCCM, NIF, DPO, déclaration APDPVP, hébergeur) sont
affichées « **à compléter** » : rien n'a été inventé (question ouverte n°10).

## 2. Fonctionnalités livrées

| Élément                      | Description                                                                                                                    | Fichiers                                                                         |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------- |
| Module `privacy` (API)       | `GET /account/data`, `GET /account/deletion`, `POST /account/delete` ; contrat 1.23.0                                          | `apps/api/src/modules/privacy/`                                                  |
| Données de chaque module     | `XxxPersonalData` (copie, empêchements, effacement) dans identity, orders, payments, shipping, vendors, audit                  | `*/infrastructure/*-personal-data.ts`                                            |
| Confirmation du mot de passe | Extraite du changement de mot de passe (S7-T07), compteur propre à la suppression                                              | `identity/application/password-confirmation.service.ts`                          |
| Comptes inactifs             | Tâche de nuit : avis 30 jours avant, effacement après 3 ans ; activité notée à la connexion et pendant les visites             | `privacy/infrastructure/inactivity-scheduler.ts`, `prisma-session.repository.ts` |
| Migration                    | Colonnes de consentement, d'activité et d'effacement ; anonymisation permise **une fois** par les règles « figées » de la base | `prisma/migrations/20261019150000_donnees_personnelles/`                         |
| E-mails                      | « Compte supprimé » et « compte bientôt supprimé »                                                                             | `identity/infrastructure/email/email-templates.ts`                               |
| Inscription                  | Case « J'ai 18 ans ou plus » (`adult: true`), dates gardées comme preuve                                                       | `SignupForm.tsx`, `schemas.ts`                                                   |
| « Mes données » (site)       | Téléchargement (relayé par le serveur du site), suppression (mot de passe + case « définitif »), empêchements expliqués        | `components/account/`, `lib/privacy/`, `app/compte/mes-donnees/route.ts`         |
| Pages légales                | Politique de confidentialité, mentions légales ; informations légales dans un seul fichier                                     | `components/legal/`, `lib/legal.ts`                                              |
| Conformité                   | Registre des traitements, procédure des demandes de droits, procédure de violation de données                                  | `docs/conformite/`                                                               |

## 3. Décisions techniques

- [ADR-0047](../architecture/adr/0047-donnees-personnelles-apdpvp.md). Choix du 2026-10-19 : les recommandations sur
  toute la ligne (effacement après mot de passe, factures 10 ans, JSON, « à compléter », case 18 ans, pas de bandeau
  cookies, 3 ans d'inactivité avec avis).
- `privacy` assemble les données des autres modules et **n'est importé par personne** : pas de cycle, règles
  d'architecture respectées.
- L'effacement se fait en **une transaction** : tout ou rien. Les règles de la base n'autorisent qu'une
  anonymisation, une fois, d'une commande terminée, et seulement des coordonnées.

## 4. Sécurité

### Relecture indépendante (agent séparé, avant la PR) : 0 grave, 6 moyennes, 5 faibles

| Constat                                                                                               | Correction                                                                                                                      |
| ----------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| Moyen : une commande créée pendant l'effacement gardait les coordonnées                               | Le panier est verrouillé comme lors de la création d'une commande : elle finit avant (et bloque) ou attend                      |
| Moyen : un paiement confirmé tard par l'opérateur après l'effacement perdait son remboursement        | Nouvel empêchement `PAIEMENT_EN_ATTENTE` (en attente, ou expiré / échoué depuis moins de 24 h) ; erreur écrite au journal sinon |
| Moyen : le site disait que les factures perdent les coordonnées (faux : une facture ne change jamais) | Textes corrigés (site, e-mail, politique, registre, ADR) : factures gardées telles qu'émises                                    |
| Moyen : un compte avec un mobile seul aurait été effacé sans avis (pas de SMS)                        | Pas de canal → ni avis ni effacement ; on réessaie chaque nuit                                                                  |
| Moyen : une connexion entre la lecture et l'écriture de l'avis programmait quand même l'effacement    | L'avis n'est noté que si le compte est toujours inactif ; e-mail et journal seulement dans ce cas                               |
| Moyen : un vendeur à boutique suspendue pouvait supprimer son compte                                  | Boutique suspendue = empêchement (la réactivation d'une boutique sans propriétaire actif était déjà refusée)                    |
| Faible : notes de l'équipe gardées 1 an dans le journal d'audit                                       | Écrit dans la politique et le registre                                                                                          |
| Faible : la copie ne contenait pas le journal du compte                                               | Ajouté : action et date ; adresse IP seulement pour ses propres actions ; jamais les détails                                    |
| Faible : la base permettait d'anonymiser une commande ou un paiement en cours                         | Refusé par la base (défense en profondeur), testé                                                                               |
| Faible : dates de consentement déduites                                                               | Vérifié : seul l'inscription crée un compte, et elle exige les deux cases ; comptes plus anciens : sans date (noté)             |
| Faible : un compte désactivé ne peut ni copier ni supprimer                                           | Écrit dans l'ADR : procédure écrite                                                                                             |

Confirmé sans problème par la relecture : aucun accès aux données d'un autre compte, aucun secret dans la copie
(empreinte, jeton, secret TOTP, codes de secours, pièces KYC), double demande sans effet, blocage après 3 erreurs,
réponses `no-store`, nom de fichier sûr, aucune donnée personnelle dans les journaux techniques ni de lien dans les
e-mails.

## 5. Qualité

- API : 591 tests unitaires ✓ (dont règles du module, service, alignement contrat / domaine, e-mails).
- API : 208 tests d'intégration sur une vraie base ✓, dont 7 nouveaux :
  - copie (contenu, aucun secret, journal, `no-store`) ;
  - empêchements (commande en cours, paiement sans réponse, compte d'équipe) ;
  - suppression de bout en bout (mot de passe faux, case non cochée, effacement de tous les modules, commande,
    paiement et remboursement anonymisés, connexion impossible ensuite) ;
  - règles de la base (anonymisation partielle, double ou d'une commande en cours refusées) ;
  - comptes inactifs (avis, deuxième passage sans effet, effacement, connexion qui annule, équipe épargnée).
- Migrations rejouées sur une base neuve : OK.
- Site : tests de l'adaptateur et des messages ; parcours de bout en bout (copie téléchargée, suppression, e-mail,
  connexion refusée ensuite).
- Contrat : 32 tests ✓ ; OpenAPI régénéré.
- Format, lint, types, Gitleaks, Semgrep, CodeQL : voir la PR.
- Aucun réglage Render ni fichier `.env` modifié.

## 6. Captures d'écran

Sans objet (la section suit le style de « Mon compte » ; vérifiée par le test de bout en bout).

## 7. Limites connues / dette technique

- **Question ouverte n°10** : le client doit fournir les informations légales, choisir DPO ou déclaration, et
  déclarer les transferts (hébergeur, S3, Brevo) **avant l'ouverture au public**.
- Pas encore d'écran pour corriger son prénom ou son nom (service client en attendant) ni d'outil d'équipe pour
  effacer un compte qui ne peut plus se connecter (S7-T09 ou S7.5).
- Avis d'inactivité par e-mail seulement : les comptes « mobile seul » attendront le fournisseur SMS.
- Une demande de boutique envoyée dans la même seconde que l'effacement reste possible (risque accepté, ADR-0047).
- Les comptes créés avant cette version n'ont pas de date « 18 ans ou plus ».

## 8. Prochaines étapes

- Fusionner, puis sur chaque base : `db:deploy` puis `db:check` (migration).
- Envoyer au client la question n°10.
- S7-T09 : écrans d'administration reportés.
