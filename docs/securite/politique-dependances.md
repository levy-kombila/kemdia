# Politique de mise à jour des dépendances

S7-T07, OWASP ASVS 5.0 V15.1.1 et V15.2.1. Choix du propriétaire du 2026-10-19. Elle s'applique aux paquets npm
(site, API, contrat), aux images Docker (Node.js, PostgreSQL, Caddy), aux actions GitHub et aux outils de la CI (ZAP,
Gitleaks, Semgrep).

## Délais de correction d'une vulnérabilité connue

Le délai compte à partir du moment où l'alerte est visible : PR Dependabot, `pnpm audit`, scan Trivy de l'image,
avis GitHub.

| Gravité (CVSS) | Délai maximal                                                           | Qui le voit                                   |
| -------------- | ----------------------------------------------------------------------- | --------------------------------------------- |
| Critique       | **7 jours** (mise en production comprise)                               | CI rouge (`pnpm audit`, Trivy), alerte GitHub |
| Élevée         | **30 jours**                                                            | CI rouge (`pnpm audit`, Trivy)                |
| Moyenne        | **Sprint suivant**                                                      | Rapport `pnpm audit`, Dependabot              |
| Faible         | **Sprint suivant**, ou écart accepté et écrit dans le rapport du sprint | Dependabot                                    |

Si aucune version corrigée n'existe, une parade est mise en place dans le même délai : dépendance retirée ou
remplacée, fonction coupée, règle de Caddy. Elle est décrite dans le rapport de la tâche.

## Mises à jour ordinaires

- **Dependabot** : chaque lundi, PR groupées (npm, Docker, docker-compose, actions GitHub). Elles sont traitées **dans
  la semaine**, CI verte obligatoire.
- **Versions majeures** (Node.js, PostgreSQL, Next.js, NestJS, Prisma) : jamais automatiques. Elles font l'objet d'une
  tâche planifiée, avec un ADR si le changement est important.
- **Outils épinglés hors Dependabot** (ZAP, Gitleaks, Semgrep) : vérifiés à chaque fin de sprint. La somme de contrôle
  est mise à jour avec la version.

## Contrôles

- `pnpm audit` (workflow « Sécurité ») échoue sur une vulnérabilité élevée ou critique, sur chaque PR et chaque lundi.
- Trivy analyse chaque image Docker publiée (job « Image Docker »).
- La revue ASVS de chaque fin de sprint vérifie qu'aucun délai n'est dépassé (ASVS 5.0 V15.2.1).
