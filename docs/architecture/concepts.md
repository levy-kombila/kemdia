# Comprendre l'architecture de Kemdia — les concepts en mots simples

> Pour toute l'équipe, technique ou non. Chaque notion est illustrée avec un exemple **tiré de Kemdia**.
> Si un terme du KSAD ou d'un rapport n'est pas clair, il doit être expliqué ici.

## 1. Monolithe modulaire

**Image** : un **centre commercial**. Un seul bâtiment (une seule application à déployer), mais des boutiques séparées
(catalogue, commandes, paiements…) avec chacune sa porte d'entrée. Une boutique ne passe pas par l'arrière-boutique d'une autre.

**Chez Kemdia** : `apps/api` sera une seule application NestJS, découpée en 7 modules ([ADR-0006](adr/0006-monolithe-modulaire-7-modules.md)).
Le module _Commandes_ ne lit pas directement les tables du _Catalogue_ : il demande le prix au catalogue.

**Pourquoi pas des microservices ?** Ce serait 7 applications, 7 déploiements, 7 bases : trop lourd pour 2 développeurs.
Si un jour un module est très sollicité (ex. la recherche), on pourra le sortir en service séparé, parce qu'il est déjà bien isolé.

## 2. DDD (Domain Driven Design) et « contexte borné »

**Idée** : le code parle **la langue du métier**. Si le métier dit « commission d'affiliation », le code s'appelle `CommissionAffiliation`, pas `calcul2`.

**Contexte borné** : une zone où un mot a **un seul sens**. Exemple : « produit » dans le _Catalogue_ (photos, description, prix affiché)
n'est pas la même chose que la « ligne produit » dans une _Commande_ (prix **au moment de l'achat**, quantité).
Les séparer évite qu'un changement de prix dans le catalogue modifie une commande déjà payée.

## 3. Architecture hexagonale (ports et adaptateurs)

**Image** : une **prise électrique universelle**. L'appareil (le cœur métier) a une prise standard (le _port_) ;
selon le pays, on branche un adaptateur différent.

**Chez Kemdia** : le cœur dit « je dois encaisser 25 000 FCFA » (_port_ `Paiement`).
Un **adaptateur Airtel Money** et un **adaptateur Moov Money** savent parler à chaque opérateur.
Pour ajouter Orange Money au Sénégal, on écrit un nouvel adaptateur ; **les règles de commande ne changent pas**.

```
        ┌──────────── Adaptateurs (techniques, remplaçables) ────────────┐
        │  API REST NestJS   PostgreSQL   Airtel Money   Moov   SMS      │
        │        ↓               ↑            ↑           ↑      ↑       │
        │   ┌──────────────── Ports (interfaces) ─────────────────┐      │
        │   │   Cœur métier : commandes, prix, règles BR-xxx      │      │
        │   │   (TypeScript pur, aucun framework, testé à 100 %)  │      │
        │   └─────────────────────────────────────────────────────┘      │
        └────────────────────────────────────────────────────────────────┘
```

**Déjà visible au Sprint 1** : `apps/web/src/lib/catalog.ts` est un « port » : aujourd'hui il lit un fichier de démonstration,
au Sprint 3 il appellera l'API — **sans modifier un seul composant** du site.

## 4. Un schéma PostgreSQL par module

Une base de données PostgreSQL peut contenir plusieurs **schémas** (comme des dossiers). Chaque module a le sien :
`catalog.products`, `orders.orders`… Règle : **pas de jointure entre schémas**. Ainsi, un module peut être déplacé dans une autre base
sans casser les autres.

## 5. UUID

Un identifiant comme `7f3c9a2e-5b1d-4e8a-9c6f-2d4b8e1a0c37` au lieu de `1, 2, 3…`.
**Pourquoi** : avec des numéros qui se suivent, quelqu'un peut deviner la commande n°1042 d'un autre client (c'est la faille HIGH-01 de l'ancien site).
Un UUID ne se devine pas.

## 6. Rendu serveur (SSR), pages statiques (SSG) et Server Components

- **Page statique** : préparée à l'avance, servie instantanément (ex. fiche produit). Idéal pour la 3G.
- **Rendu serveur** : préparée à chaque visite (ex. résultats de recherche).
- **Server Component** : partie de page calculée sur le serveur ; **aucun JavaScript** envoyé au téléphone pour elle.
  Seuls les éléments interactifs (bouton panier, menu) envoient du JavaScript.

## 7. CI/CD

- **CI (intégration continue)** : à chaque modification, des robots vérifient tout (tests, sécurité, construction). Si c'est rouge, on ne fusionne pas.
- **CD (déploiement continu)** : quand c'est vert, la nouvelle version est **mise en ligne automatiquement** (démo, staging), puis en production sur décision (tag de version).
- **Image Docker** : le site **emballé avec tout ce qu'il lui faut** pour tourner n'importe où, à l'identique.
- **Digest** : l'empreinte unique d'une image (`sha256:…`). Déployer « par digest » garantit que la production reçoit **exactement** l'image testée.

## 8. Sécurité : quelques mots du quotidien

| Terme                   | Sens                                                      | Exemple Kemdia                                                            |
| ----------------------- | --------------------------------------------------------- | ------------------------------------------------------------------------- |
| **RBAC**                | Les droits dépendent du **rôle** (client, vendeur, admin) | Un vendeur ne voit que ses commandes                                      |
| **OTP**                 | Code à usage unique envoyé par SMS ou e-mail              | Vérifier le numéro de téléphone à l'inscription                           |
| **KYC**                 | Vérification d'identité d'un vendeur                      | Pièce d'identité + compte Mobile Money avant tout versement               |
| **Webhook**             | L'opérateur **nous prévient** qu'un paiement est confirmé | Airtel appelle Kemdia : « paiement 123 réussi » ; on vérifie sa signature |
| **Limitation de débit** | Nombre d'essais limité par minute                         | 5 tentatives de code OTP par minute                                       |
| **CSP**                 | Liste des sources de scripts autorisées par le navigateur | Bloque un script injecté par un pirate                                    |
| **Secret**              | Mot de passe ou clé d'accès, **jamais** dans Git          | Jeton Docker Hub stocké dans les secrets GitHub                           |
