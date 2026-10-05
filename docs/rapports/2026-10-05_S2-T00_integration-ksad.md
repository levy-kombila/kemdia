# Rapport — Intégration du KSAD et mise à jour du planning

|                                                 |                                      |
| ----------------------------------------------- | ------------------------------------ |
| **Date**                                        | 2026-10-05                           |
| **Sprint / tâches**                             | S2 — S2-T00                          |
| **Sections du cahier d'architecture modifiées** | §1, §2.1, §2.2, §3.3, §4, §10 (v0.4) |

## 1. Résumé

L'équipe avait commencé un cahier d'architecture (KSAD, 10 volumes) et un business plan. Ces documents ont été lus,
résumés et **intégrés à la documentation du dépôt**, qui devient la référence unique. Ils confirment les choix techniques déjà faits
(monolithe modulaire, Next.js, NestJS, PostgreSQL, hexagonal, DDD) et précisent le périmètre du MVP, ce qui modifie le planning.

## 2. Livré

| Document                                                              | Contenu                                                                                                                  |
| --------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| [`references/ksad-synthese.md`](../references/ksad-synthese.md)       | Résumé de chaque volume en mots simples + décision (adopté / adapté / reporté)                                           |
| [`architecture/regles-metier.md`](../architecture/regles-metier.md)   | 18 règles métier numérotées **BR-xxx** + correspondance des exigences **FR-xxx** avec les sprints + 7 questions ouvertes |
| [`architecture/concepts.md`](../architecture/concepts.md)             | Monolithe modulaire, DDD, hexagonal, schémas, UUID, SSR, CI/CD, RBAC, OTP, KYC… expliqués avec des exemples Kemdia       |
| [ADR-0006](../architecture/adr/0006-monolithe-modulaire-7-modules.md) | 18 contextes du KSAD regroupés en **7 modules** pour le MVP                                                              |
| Cahier d'architecture v0.4                                            | Modèle économique, périmètre MVP, objectifs mesurables, modules du backend                                               |
| Planning                                                              | Vendeurs tiers remontés dans le MVP (S6), jalons de version, **actions hors code** à lancer tôt                          |

## 3. Décisions

- **NestJS** retenu pour le backend (le KSAD laissait le choix Django / NestJS) : un seul langage, déjà le choix « préférentiel » du Volume 7.
- **7 modules au MVP** au lieu de 18 (équipe de 2 personnes) ; les 18 restent la carte cible.
- **Marketplace dès le MVP** (50 vendeurs partenaires) ; **affiliation juste après** le MVP.

## 4. Points d'attention

- Le dossier de l'équipe contenait un fichier vide (`Kemdia_Volume_1.docx`) et trois volumes réduits à leur plan (8, 9, 10) : rien n'est perdu,
  leurs sujets sont couverts par `SECURITY.md`, le guide Git et la CI.
- Les originaux `.docx` restent **hors du dépôt** (documents de travail) ; seule la synthèse est versionnée.
- Plusieurs règles sont « à définir » : voir les [questions ouvertes](../architecture/regles-metier.md#questions-ouvertes).

## 5. Prochaines étapes

Suite du Sprint 2 : S2-T01 (pages connexion / inscription par e-mail ou téléphone) puis S2-T02 (tunnel de commande en maquette).
