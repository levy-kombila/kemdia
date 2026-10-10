# ADR-0025 — Coupons de réduction

- **Statut** : Accepté
- **Date** : 2026-10-10
- **Tâche** : S5-T03
- **Complète** : [ADR-0024](0024-commandes-reservation-stock.md) (commandes), [ADR-0020](0020-roles-journal-audit.md) (administration, journal d'audit)

## Contexte

L'ancien site Django laissait **déduire un coupon deux fois** et descendre un total à 0 FCFA (failles HIGH-05 / CRIT-01).
Les règles BR-030 (coupon expiré ou épuisé refusé, utilisation comptée de façon atomique) et BR-031 (cumul avec les promotions,
question ouverte n° 2) arrivent avec les commandes.

Choix du propriétaire (2026-10-10) :

| Question             | Choix                                                                                |
| -------------------- | ------------------------------------------------------------------------------------ |
| Type de réduction    | **Pourcentage** (plafond en FCFA possible) **ou montant fixe**                       |
| Assiette             | **Articles seulement** (jamais la livraison) ; pas sur les prix barrés par défaut    |
| Limites              | Toutes, réglables par coupon : total, **1 fois par compte** (défaut), minimum, dates |
| Création             | **Routes d'administration de l'API** (écrans au S6)                                  |
| Comptage             | **À la commande**, **rendu** si la commande est annulée ou pas payée à temps         |
| Coupons par commande | **Un seul**                                                                          |
| Format du code       | **4 à 20 lettres, chiffres ou tirets, sans casse** (enregistré en majuscules)        |

## Décision

| Sujet             | Choix                                                                                                                                                                                                                                                                                           | Raison                                                                                           |
| ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| Où                | Module `orders` : tables `coupons` et `coupon_redemptions` (schéma `orders`) ; colonnes `discount` et `coupon_code` de la commande                                                                                                                                                              | Le coupon fait partie du calcul de la commande                                                   |
| Calcul            | Pourcentage arrondi à l'entier inférieur et plafonné, ou montant fixe ; sur les lignes éligibles ; **jamais tous les articles** (commande à 0 FCFA impossible à payer) ; minimum sur le total des articles                                                                                      | BR-004 ; pas de commande gratuite par erreur                                                     |
| BR-031            | Une ligne dont la variante a un **prix barré** n'est pas éligible, sauf coupon « cumulable » (`stackableWithSales`, non par défaut)                                                                                                                                                             | Question ouverte n° 2 : non cumulable par défaut, réglable sans code                             |
| Livraison         | Frais et livraison offerte calculés sur les articles **après** réduction ; le paiement à la livraison sur le total                                                                                                                                                                              | Un coupon ne sert pas à atteindre la livraison offerte                                           |
| Comptage (BR-030) | Dans la transaction de la commande : coupon **verrouillé après les variantes** (`FOR UPDATE`), utilisations du compte relues sous verrou, compteur +1, utilisation enregistrée ; au moindre refus, rien n'est gardé                                                                             | Le dernier coupon ne part qu'une fois ; ordre des verrous identique partout (pas d'interblocage) |
| Remise            | Annulation (client, paiement non reçu) : utilisation rendue (`released_at`, compteur −1) ; **déclencheur SQL en filet de sécurité** pour tout autre chemin d'annulation                                                                                                                         | Choix du propriétaire ; robuste même pendant un déploiement                                      |
| Montant fixe      | **Minimum d'articles obligatoire et supérieur au montant**                                                                                                                                                                                                                                      | Relecture de sécurité : pas d'articles gratuits                                                  |
| Codes             | Inconnu, désactivé ou **pas encore valable** : même réponse (`COUPON_INVALIDE`) ; **10 codes refusés en 15 min** par compte → `COUPON_TROP_D_ESSAIS` (429) ; panier vide : le code n'est pas regardé ; devis limité à 30/min par compte                                                         | On ne devine pas les codes (ni une campagne avant son lancement)                                 |
| Administration    | `POST/GET /api/v1/admin/coupons`, `PATCH /api/v1/admin/coupons/{id}` (activer / désactiver) ; administrateur connecté depuis < 15 min ; **journal d'audit** (`coupon.created`, `coupon.updated`) dans la même transaction                                                                       | Mêmes protections que les rôles (ADR-0020)                                                       |
| Base de données   | Contraintes : code, valeurs, limites, compteur ≤ limite, total > 0, réduction < articles, réduction ⇔ code. Déclencheurs : règles d'un coupon **figées** (seuls activation et compteur changent), réduction de la commande figée, utilisation seulement « rendue », une fois ; rien ne s'efface | Même un bogue ne peut pas changer une règle ou un montant après coup                             |
| Migration         | Ajout seul : `discount` à 0 et `coupon_code` vide par défaut (l'API précédente insère toujours des commandes valides) ; la nouvelle contrainte des montants est posée **avant** de retirer l'ancienne                                                                                           | Aucun moment sans contrôle des montants                                                          |
| Contrat           | 1.9.0 : `couponCode` dans le devis et la commande, `discount` / `coupon` dans le devis, `discount` / `couponCode` dans la commande ; schémas `Coupon*` ; `COUPON_ERROR_CODES` ; `COUPON_LIMITS`                                                                                                 | Le site (S5-T07) affichera la réduction et ses refus                                             |

## Options écartées

- **Compter l'utilisation au paiement seulement** : deux clients pourraient obtenir le dernier coupon ; et la commande serait déjà créée avec un montant faux.
- **Coupons cumulables entre eux** : ordre d'application, risques de réduction surprise ; un seul par commande.
- **Modifier un coupon après sa création** : les commandes passées n'auraient plus la même règle ; on désactive et on en crée un autre.
- **Codes longs tirés au hasard** : impossibles à deviner, mais pas de codes « marketing » lisibles ; la limite d'essais suffit (codes privés : 8 caractères ou plus conseillés).

## Conséquences

- ➕ Plus de double déduction ni de commande gratuite ; une limite de coupon ne peut pas être dépassée, même par des clients simultanés.
- ➕ L'administrateur crée ses promotions sans attendre le back-office (par l'API, avec une trace).
- ➖ Une commande Mobile Money non payée garde une utilisation pendant 30 minutes (comme le stock) : un coupon limité peut paraître épuisé un moment.
- ➖ Le lien « réduction de la commande ⇔ utilisation du coupon » est garanti par l'application et les tests, pas par une contrainte SQL (pas de clé entre les deux).
- ➖ Compteurs d'essais en mémoire (perdus au redémarrage, une instance) : Redis au S7, comme les autres limites.
