# ADR-0002 — TypeScript de bout en bout : Next.js (frontend) + NestJS (backend)

- **Statut** : Accepté (frontend) · Proposé (backend, confirmé au Sprint 3)
- **Date** : 2026-10-05

## Contexte

Contraintes du marché gabonais :

- trafic majoritairement **mobile**, réseaux 3G/4G variables, forfaits data coûteux → pages légères ;
- référencement Google important pour une nouvelle marque → rendu côté serveur ;
- paiements Mobile Money (Airtel Money, Moov Money) via API REST et webhooks ;
- petite équipe : un seul langage réduit la charge cognitive.

## Options étudiées

| Option                                     | +                                                                                                                         | −                                                                          |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| Rester en Python (Django propre / FastAPI) | Connaissance existante                                                                                                    | Front en templates = interactivité limitée ; ou 2 langages si front séparé |
| PHP / Laravel                              | Hébergement bon marché                                                                                                    | Moins adapté à une interface très interactive                              |
| **TypeScript : Next.js + NestJS**          | Un seul langage, typage strict partagé front/back, SSR/SEO natif, écosystème très large, React échappe le HTML par défaut | Courbe d'apprentissage React/Node                                          |

## Décision

- **Langage** : TypeScript (strict).
- **Frontend** : Next.js 16 (App Router, React 19, Server Components) + Tailwind CSS 4.
- **Backend (S3)** : NestJS + PostgreSQL + Prisma, validation systématique des entrées.
- **Tests** : Vitest (unitaires/composants), Playwright (bout en bout, S2).

## Conséquences

- Le code du catalogue n'est jamais envoyé au navigateur (`server-only`) ; seul le HTML et le JS d'interaction le sont.
- Les types (`Product`, `Category`…) serviront de contrat avec l'API.
- Node.js 22 LTS requis sur les postes et serveurs.
