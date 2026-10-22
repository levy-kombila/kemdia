# ADR-0052 — Écrans de la Finance et journal d'audit

- **Statut** : Accepté
- **Date** : 2026-10-22
- **Tâche** : S7.5-T05 (écrans d'administration reportés du S6, ex-S7-T09)
- **Complète** : [ADR-0026](0026-paiements.md) (paiements, remboursements, encaissements),
  [ADR-0028](0028-factures.md) (factures), [ADR-0020](0020-roles-journal-audit.md) (journal d'audit),
  [ADR-0051](0051-roles-equipe-utilisateurs.md) (rôle Finance)

## Contexte

Les factures, remboursements, encaissements en espèces, codes promo et réglages de la Finance avaient leur API depuis
le S5, mais aucun écran : tout passait par des appels directs. Le journal d'audit n'était lisible que par l'API. Le
S7.5-T04 a créé le rôle **Finance** ; il lui faut ses pages.

Choix du propriétaire (2026-10-22) :

| Question                         | Choix                                                                                 |
| -------------------------------- | ------------------------------------------------------------------------------------- |
| Écran « Factures »               | **Liste + recherche + PDF**, et **renvoi de l'e-mail** au client                      |
| Encaissements en espèces         | **Liste « à encaisser »** (commandes livrées en espèces), montant attendu prérempli   |
| Journal d'audit                  | **Liste + filtre par action** (lecture seule)                                         |
| Autres écrans dans la même tâche | **Réglages de facturation**, **codes promo**, **réglages du paiement à la livraison** |

## Décision

1. **Nouvelles routes de l'API** (rôle `finance`, double authentification) :
   - `GET /admin/invoices?q=&after=` : factures et avoirs du plus récent au plus ancien, 30 par page ; `q` n'accepte
     qu'un numéro de facture ou d'avoir (`KMD-F-…`, `KMD-A-…`) ou de commande (`KMD-…`), jamais un nom ;
   - `GET /admin/invoices/{number}` : le PDF (le même que celui du client), **téléchargement au journal**
     (`invoice.downloaded`) ;
   - `POST /admin/invoices/{number}/resend` : renvoi **immédiat** à l'e-mail vérifié du client (`invoice.resent`) ;
   - `GET /admin/cash-to-collect` : commandes à la livraison expédiées ou livrées, pas encore encaissées (livrées
     d'abord, 100 au plus).
2. **Renvoi d'une facture.** La base fige la facture, y compris le suivi de son envoi automatique (il ne fait
   qu'avancer). Le renvoi ne touche donc pas à ce suivi : il envoie tout de suite, à part. Il est refusé
   (`ENVOI_IMPOSSIBLE`) pendant l'envoi automatique (la facture partirait deux fois), sans e-mail vérifié, sans envoi
   configuré, dans les 10 minutes qui suivent un renvoi de la même facture, et au-delà de 5 renvois par client et par
   heure (relecture de sécurité). La place est réservée avant toute attente : deux clics simultanés n'envoient qu'un
   e-mail.
3. **Pages du site** (`/equipe/…`), chacune réservée à son rôle (menu et garde ; l'API reste juge) :
   - Finance : `factures` (+ relais du PDF, vérifié et jamais gardé en cache), `encaissements`, `remboursements`,
     `codes-promo`, `reglages` ; compteurs « à encaisser » et « remboursements à faire » au tableau de bord ;
   - Administrateur : `journal`, filtre par action (libellés en français) et par compte, 50 lignes par page.
4. **Formulaires.** Simples formulaires envoyés à des actions serveur, qui revérifient chaque champ avec les schémas
   du contrat (code promo, facturation) ou des listes fermées (zones, statuts) avant l'API. Les dates d'un code promo
   sont prises à l'heure de Libreville ; la date de fin est **incluse** (jusqu'à 23 h 59).

5. **Index** (migration `20261022150000_index_factures`) : date d'émission décroissante et numéro de commande, pour
   la liste et la recherche.

## Conséquences

- La Finance travaille sans appel direct à l'API ; chaque consultation de PDF et chaque renvoi laissent une trace.
- Un libellé manquant pour une nouvelle action du journal fait échouer la vérification des types du site.
- Le délai de 10 minutes entre deux renvois est gardé en mémoire : il repart de zéro au redémarrage de l'API (une
  seule instance au MVP).

## Alternatives écartées

- **Remettre à zéro le suivi de l'envoi automatique** pour renvoyer : impossible sans affaiblir la règle de la base qui
  fige les factures (obligation légale).
- **Recherche par nom du client** : écartée ; elle exposerait des données personnelles à partir de quelques lettres.
- **Export CSV du journal** : non retenu pour l'instant (choix du propriétaire).
