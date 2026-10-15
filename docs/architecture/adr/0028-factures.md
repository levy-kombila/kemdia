# ADR-0028 — Factures et avoirs : au paiement reçu, numéros par année sans trou, PDF et e-mail

- **Statut** : Accepté
- **Date** : 2026-10-15
- **Tâche** : S5-T06
- **Complète** : [ADR-0026](0026-paiements.md) (paiements), [ADR-0027](0027-notifications-signees-bac-a-sable.md) (notifications), [ADR-0016](0016-inscription-tickets-emails.md) (envoi des e-mails)

## Contexte

FR-015 : le client reçoit une **facture numérique** après le paiement. Une facture est une pièce comptable : son numéro ne saute
jamais, elle ne se modifie plus une fois émise, et une commande facturée puis annulée appelle un **avoir**. La TVA (BR-023,
question ouverte n° 6) et les informations légales de l'entreprise (raison sociale, NIF, RCCM) ne sont pas encore connues.

Choix du propriétaire (2026-10-11) :

| Question                            | Choix                                                                    |
| ----------------------------------- | ------------------------------------------------------------------------ |
| Quand la facture est-elle établie ? | **Au paiement reçu** (Mobile Money confirmé, ou espèces encaissées)      |
| Numérotation                        | **Par année, sans trou** : `KMD-F-2026-000001`                           |
| TVA                                 | **Sans TVA pour l'instant** : mention « TVA non applicable », réglable   |
| Informations de l'entreprise        | **Réglage administrateur, provisoire** ; copie figée dans chaque facture |
| Commande facturée puis annulée      | **Avoir automatique** du même montant (`KMD-A-2026-000001`)              |
| Remise au client                    | **E-mail + téléchargement**                                              |

## Décision

| Sujet               | Choix                                                                                                                                                                                                                                                          | Raison                                                                                    |
| ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| Où                  | Module `payments` (tables `invoices`, `invoice_counters`, `billing_settings`) ; la commande est lue par `OrderPayments`, le contact du client par le nouveau port `AccountDirectory` du module identity (e-mail **vérifié** seulement)                         | La facture naît du paiement                                                               |
| Émission            | **Dans la transaction** qui confirme le paiement Mobile Money (`applyProviderResult`) ou note l'encaissement ; avoir dans la transaction de l'annulation par l'administrateur (seul chemin d'annulation d'une commande payée)                                  | Paiement et facture ensemble, ou rien                                                     |
| Numéros             | Compteur par type et par année (`INSERT … ON CONFLICT DO UPDATE … +1`), ligne verrouillée jusqu'à la fin de la transaction ; transaction annulée → numéro rendu ; déclencheur : il n'avance que d'un ; année à l'heure du Gabon (UTC+1)                        | Aucun trou, aucun doublon, même avec des paiements simultanés                             |
| Copie figée         | Entreprise, client (nom, téléphone, adresse de livraison), lignes, montants, mention de TVA, moyen et référence du paiement copiés ; déclencheur : **rien ne change** sauf le suivi de l'e-mail ; rien ne s'efface ; un avoir reprend sa facture à l'identique | Obligation comptable ; un changement de réglage ne touche jamais une facture émise        |
| Entreprise          | `GET/PUT /api/v1/admin/settings/billing` (journal) ; valeurs de départ « à compléter » ; **en préproduction et en production, pas de facture tant qu'un administrateur ne les a pas renseignées** — le paiement passe, la facture est établie au rattrapage    | Relecture de sécurité : une facture figée avec « NIF à compléter » ne se corrigerait plus |
| PDF                 | pdf-lib (sans dépendance native), police Helvetica standard ; refait **à l'identique** à la demande depuis la copie figée (rien de stocké) ; caractères inconnus remplacés ; textes longs coupés ; plusieurs pages si besoin                                   | Pas de fichier à garder ni à sauvegarder ; jamais d'erreur sur un nom ou une adresse      |
| Téléchargement      | `GET /api/v1/orders/{ref}/invoices` et `…/invoices/{numéro}` (PDF, `attachment`, `no-store`) ; seulement le client de la commande (sinon 404)                                                                                                                  | Choix du propriétaire                                                                     |
| E-mail              | Tâche planifiée (chaque minute), **après** la transaction : envoi **réservé** (essai compté avant l'envoi : deux instances n'envoient pas deux fois), 5 essais espacés (1 min, 10 min, 1 h, 6 h) ; même transport que les codes (`EMAIL_TRANSPORT`)            | Un e-mail lent ne bloque jamais un paiement ; une panne d'une heure ne fait rien perdre   |
| Rattrapage          | La même tâche établit les factures manquantes des commandes payées, non annulées, non remboursées                                                                                                                                                              | Rien ne reste sans facture                                                                |
| Transports d'e-mail | Déplacés du module identity vers `src/mail/` (socle partagé), pièces jointes (2 Mo au plus)                                                                                                                                                                    | Un seul réglage d'envoi pour tout                                                         |
| Contrat             | 1.12.0 : `InvoiceSummary`, `InvoiceList`, `BillingSettings*` ; `INVOICE_KINDS`, `INVOICE_NUMBER_PATTERN`, `DEFAULT_VAT_MENTION` ; `FACTURE_INTROUVABLE` ; action d'audit `settings.billing_updated`                                                            | Le site (S5-T07) montrera les factures dans « Mes commandes »                             |

Ordre des verrous : commande → variantes → coupon → paiement → **compteur** (pris le plus tard possible).

## Options écartées

- **Facture à la commande** : il faudrait annuler (avoir) chaque commande Mobile Money jamais payée.
- **Numérotation continue sans année** : moins lisible, et l'usage comptable repart à chaque exercice.
- **Séquence PostgreSQL** (`nextval`) : rapide, mais un numéro tiré dans une transaction annulée est perdu (trous).
- **PDF stocké** : un fichier à garder, sauvegarder et protéger ; le refaire depuis la copie figée donne exactement le même.
- **Générateur HTML → PDF (navigateur sans tête)** : lourd dans l'image Docker et sur Render gratuit.
- **TVA 18 % dès maintenant** : non confirmée (question 6) ; la mention reste réglable.

## Conséquences

- ➕ FR-015 : facture au paiement, avoir à l'annulation, numéros sans trou, PDF et e-mail ; rien ne se modifie après coup.
- ➕ Les informations légales et la mention de TVA se règlent sans redéployer ; les factures déjà émises ne bougent pas.
- ➖ Toutes les confirmations de paiement passent une à une sur la ligne du compteur de l'année (quelques millisecondes chacune) ; à surveiller avec les `PANIER_OCCUPE` du webhook.
- ➖ Aucune adresse e-mail vérifiée (compte par téléphone) : pas d'e-mail, la facture se télécharge.
- ➖ Pas encore d'écran pour l'administrateur (voir, renvoyer une facture) : S6.
- ➖ pdf-lib 1.17.1 n'évolue plus (aucune faille connue) ; à remplacer si besoin, le port `InvoiceRenderer` l'isole.
- ➖ TVA : à revoir avec l'expert-comptable (question 6) — une TVA réelle demandera des montants HT / TVA sur la facture.
