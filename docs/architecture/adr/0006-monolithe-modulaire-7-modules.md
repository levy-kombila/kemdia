# ADR-0006 — Monolithe modulaire : 7 modules au MVP pour 18 contextes métier

- **Statut** : Accepté
- **Date** : 2026-10-05
- **Source** : KSAD Volumes 3, 4 et 5 ([synthèse](../../references/ksad-synthese.md))

## Contexte

Le KSAD (Volume 3) identifie **18 contextes métier** (bounded contexts). Le Volume 4 retient un **monolithe modulaire**
avec architecture hexagonale, et le Volume 5 un **schéma PostgreSQL par module**.
L'équipe compte 2 développeurs ; le lancement est prévu fin 2027.

Coder 18 modules dès le départ multiplierait les interfaces, les schémas et les tests sans apporter de valeur au MVP.

## Décision

Le backend (`apps/api`, NestJS) démarre avec **7 modules**. Chacun a son dossier, son schéma PostgreSQL et une interface publique ;
aucun module n'accède directement aux tables d'un autre.

| Module MVP      | Contextes KSAD regroupés                                            | Schéma PostgreSQL                 | Sprint |
| --------------- | ------------------------------------------------------------------- | --------------------------------- | ------ |
| `identity`      | Identity, Customer (adresses), Audit (journal)                      | `identity`                        | S4     |
| `catalog`       | Catalog, Inventory, Search, Review                                  | `catalog`                         | S3     |
| `vendors`       | Vendor (boutiques, KYC), commissions                                | `vendors`                         | S6     |
| `orders`        | Orders, panier serveur, Marketing (coupons, ventes flash), Wishlist | `orders`                          | S5     |
| `payments`      | Payments (Kemdia Pay v1 : Mobile Money, paiement à la livraison)    | `payments`                        | S5     |
| `shipping`      | Shipping (zones, frais, transporteur, suivi)                        | `shipping`                        | S7     |
| `notifications` | Notification (e-mail, SMS, WhatsApp)                                | — (pas de données propres au MVP) | S4     |

**Reportés après le MVP** : Affiliation (nouveau module `affiliates`), Recommendation, Analytics avancé, Fraud, Support (tickets) —
le support passe d'abord par WhatsApp Business.

## Règles

1. Un module expose un **service public** (son « port ») ; les autres modules n'appellent que lui.
2. **Pas de jointure SQL entre schémas** ; on échange des identifiants (UUID) et des objets simples.
3. Les changements importants sont publiés comme **événements internes** (ex. `CommandePayée`) pour découpler les modules.
4. Un module peut être **découpé** plus tard (ex. `orders` → `orders` + `marketing`) sans toucher aux autres, grâce aux règles 1 à 3.

## Conséquences

- ➕ Démarrage rapide, une seule application à déployer, une seule base.
- ➕ La carte des 18 contextes reste la cible : chaque découpage futur est déjà prévu.
- ➖ Certains modules regroupent plusieurs notions : à surveiller en revue de code pour qu'ils ne deviennent pas trop gros.
