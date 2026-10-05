# Synthèse du KSAD (Kemdia Software Architecture Document)

> Source : les volumes rédigés par l'équipe (dossier « Pour l'équipe », versions 1.0 brouillon), lus le 2026-10-05.
> Ce fichier résume **ce que dit chaque volume**, en mots simples, et **ce que le projet en fait** :
> ✅ adopté tel quel · 🔧 adapté · ⏳ reporté · ❌ écarté.
> Les originaux (.docx) restent hors du dépôt ; ce résumé est désormais la référence.

## Vue d'ensemble

| Volume | Sujet                           | Contenu réel          | Décision                                                    |
| ------ | ------------------------------- | --------------------- | ----------------------------------------------------------- |
| 1      | Vision & Business               | Complet (~7 500 mots) | ✅ repris dans le cahier §1                                 |
| 2      | Exigences produit (PRS)         | Complet (~8 600 mots) | ✅ repris : MVP, règles métier, exigences                   |
| 3      | Domain Driven Design            | Complet (~8 000 mots) | 🔧 18 contextes regroupés en 7 modules pour le MVP          |
| 4      | Architecture logicielle         | Complet (~8 800 mots) | ✅ monolithe modulaire + hexagonal                          |
| 5      | Base de données                 | Complet (~5 900 mots) | ✅ PostgreSQL partout, un schéma par module, UUID           |
| 6      | Conception d'API                | Partiel (~3 500 mots) | ✅ REST versionné, RBAC, limitation de débit                |
| 7      | Architecture frontend           | Complet (~7 700 mots) | ✅ déjà en place (Next.js, RSC, TypeScript)                 |
| 8      | Sécurité                        | Plan seul             | ✅ couvert par `SECURITY.md` + cahier §6, à compléter au S4 |
| 9      | (vide)                          | Titre seul            | —                                                           |
| 10     | Normes de code                  | Plan seul             | ✅ couvert par `workflow-git.md`, CI, Prettier/ESLint, ADR  |
| —      | Business plan « Koda le Panda » | 2 pages               | ✅ modèle économique repris (4 sources de revenus)          |

## Volume 1 — Vision & Business

**En bref** : Kemdia est une **marketplace hybride** au Gabon : Kemdia vend son propre stock **et** accueille des vendeurs tiers.
Autour : un moyen de paiement (Kemdia Pay, basé sur le Mobile Money), une logistique (Kemdia Logistics), des outils vendeurs (Seller Center).

- **Personas** : Marie (cadre, Libreville), Paul (entrepreneur vendeur, Port-Gentil), Amina (livreuse à moto), et des profils hors Gabon pour l'expansion.
- **Modèle économique** (business plan) :
  1. vente directe (stock Kemdia) ;
  2. commission marketplace de **8 à 14 %** sur les ventes des vendeurs tiers ;
  3. **affiliation** : un ambassadeur touche une commission sur les ventes qu'il génère ;
  4. **15 %** de commission sur les frais de livraison.
- **Canaux d'acquisition** : Facebook (priorité), TikTok, Instagram, **WhatsApp** (catalogue + relation client).

## Volume 2 — Exigences produit (PRS)

**En bref** : décrit **quoi** construire, sans dire comment.

- **MVP (lancement fin 2027)** : ~500 produits dont ceux de **50 vendeurs partenaires**, inscription par **e-mail ou téléphone**,
  parcours d'achat complet, **Moov Money + Airtel Money + paiement à la livraison**, livraison via un transporteur (ex. **COMAT**) sur Libreville,
  support **WhatsApp Business** + tchat.
- **Hors MVP** : double authentification client, portefeuille électronique (Kemdia Pay v2), publicité vendeurs, expansion Sénégal.
- **Objectifs MVP** : 5 000 acheteurs inscrits, 90 % des paiements en Mobile Money, satisfaction > 4/5.
- Les **règles métier** et **exigences fonctionnelles** sont reprises et numérotées dans [`regles-metier.md`](../architecture/regles-metier.md).

## Volume 3 — Domain Driven Design

**En bref** : découpe le métier en « contextes » qui ont chacun leur vocabulaire et leurs règles (voir [concepts.md](../architecture/concepts.md)).

Le volume liste **18 contextes** : Identity, Catalog, Orders, Payments, Shipping, Inventory, Vendor, Customer, Marketing, Support,
Search, Wishlist, Recommendation, Notification, Review, Analytics, Fraud, Audit.

🔧 **Adaptation** : 18 modules pour une équipe de 2 personnes, c'est trop au démarrage. On garde ces 18 noms comme **carte cible**,
mais on code **7 modules** au MVP, qui en regroupent plusieurs ([ADR-0006](../architecture/adr/0006-monolithe-modulaire-7-modules.md)).

## Volume 4 — Architecture logicielle

**En bref** : **monolithe modulaire** (une seule application découpée en modules étanches) + **architecture hexagonale**
(le cœur métier ne dépend d'aucun framework). Structure `apps/web` (Next.js), `apps/api` (NestJS « préférentiellement »), `apps/mobile` (React Native, plus tard).

✅ Adopté, et cohérent avec ce qui est déjà en place (ADR-0002, ADR-0003). Choix tranché : **NestJS** (un seul langage).

## Volume 5 — Base de données

**En bref** : **PostgreSQL uniquement**, y compris sur le poste du développeur via Docker (leçon de l'ancien projet : SQLite en local ≠ PostgreSQL en production).
**Un schéma PostgreSQL par module** (`catalog`, `orders`…), **interdiction des jointures entre schémas** : un module demande l'information à un autre par son interface.
Identifiants **UUID**, suppression « douce » (_soft delete_).

✅ Adopté pour le Sprint 3.

## Volume 6 — Conception d'API

**En bref** : API **REST** versionnée (`/api/v1/...`), noms de ressources en langage métier, contrôle d'accès par rôles (**RBAC**),
**couche anti-corruption** pour les webhooks Mobile Money (si Airtel change son API, seul l'adaptateur change),
**limitation de débit** (ex. 5 tentatives/min sur la connexion et l'OTP).

✅ Adopté pour les Sprints 3 à 5.

## Volume 7 — Architecture frontend

**En bref** : Next.js + React, **Server Components par défaut**, composants client seulement pour l'interactif, rendu statique pour le catalogue,
OpenGraph pour le partage **WhatsApp**, TypeScript partout.

✅ Déjà réalisé au Sprint 1 (voir cahier §5). À ajouter : aperçus OpenGraph par produit soignés pour WhatsApp (S2).

## Points à trancher par l'équipe

Ces sujets sont marqués « à définir » dans le KSAD ; ils sont listés dans [`regles-metier.md`](../architecture/regles-metier.md#questions-ouvertes) :
plafond et zones du paiement à la livraison, cumul coupons / ventes flash, taux exact de commission par catégorie, conditions de l'affiliation,
transporteur partenaire, seuil de TVA à confirmer avec un comptable.
