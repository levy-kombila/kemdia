# Rapport — S8-T05 : boutiques dans les suggestions de recherche

|                                                 |                                                          |
| ----------------------------------------------- | -------------------------------------------------------- |
| **Date**                                        | 2026-10-27                                               |
| **Sprint / tâches**                             | S8 — S8-T05 (dette S7.5)                                 |
| **Version**                                     | v0.8.1 → (v0.9.x à la clôture du S8) ; contrat **2.8.0** |
| **Sections du cahier d'architecture modifiées** | §3.36 (nouvelle), §3.27 (renvoi) — version 4.32          |

## 1. Résumé

Pendant la frappe, le champ de recherche proposait des rayons, des marques et des produits, mais jamais une boutique.
Il propose maintenant aussi **2 boutiques au plus** dont le nom contient les mots tapés, avec leur ville, vers leur
page publique :

```
[ élég              ]
  RAYON     …
  MARQUE    …
  [🏪] Atelier Élégance                Libreville   → /boutique/atelier-elegance
  [📷] Robe pagne …                    15 000 FCFA
```

## 2. Fonctionnalités livrées

| Élément | Ce qui change                                                                                                                                              | Où                                                                                                      |
| ------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| Contrat | `SearchSuggestions.shops` : adresse, nom, ville, « officielle » (2 au plus) ; contrat **2.8.0**                                                            | `packages/contracts/src/schemas.ts`, `docs/api/openapi.json`                                            |
| API     | `PublicShops.suggest` : boutiques actives dont le nom (sans accents ni ponctuation) contient chaque mot                                                    | `catalog/infrastructure/prisma-public-shops.repository.ts`                                              |
| API     | Recherche sur les **mots tapés**, puis sur les mots corrigés si rien n'est trouvé                                                                          | `catalog/application/catalog.service.ts` (`suggestShops`)                                               |
| Site    | Ligne « boutique » (icône, nom, ville) entre marques et produits ; adresse construite par le site                                                          | `lib/search-suggestions.ts`, `components/layout/SearchForm.tsx`                                         |
| Tests   | 1 test unitaire (mots tapés puis corrigés), 1 test d'intégration (en attente, active, accents, suspendue, `%_`), tests du site, 1 parcours de bout en bout | `catalog.service.test.ts`, `vendors.int.test.ts`, `search-suggestions.test.ts`, `e2e/catalogue.spec.ts` |

Aucune migration.

## 3. Décisions techniques

Choix du 2026-10-27 : options recommandées retenues sans t'être reposées.

- **2 boutiques** au plus (10 lignes au total au lieu de 8), boutique officielle d'abord, puis par nom ;
- seules les boutiques **actives** (validées, non suspendues), lues dans la copie du catalogue ;
- recherche sur les **mots tapés** : la correction des fautes transforme les mots en mots de produits, ce qui aurait
  empêché de trouver une boutique dont le nom n'est dans aucun produit ;
- comparaison **dans la requête SQL**, sans nouvelle colonne ni migration (table courte) ;
- ligne affichée avec une **icône de boutique** et la **ville** (le mot « Boutique » est lu par les lecteurs d'écran) ;
- une réponse sans boutiques (API plus ancienne) n'empêche pas les autres suggestions.

Décision complète : [ADR-0062](../architecture/adr/0062-suggestions-boutiques.md).

## 4. Sécurité

### Relecture indépendante (agent séparé, avant la PR) : 0 critique, 0 haute, 0 moyenne, 2 basses, 3 infos

| Problème relevé                                                                     | Correction                                                                           |
| ----------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| Basse : chaque suggestion lit toute la table des boutiques (aucun index utilisable) | **Accepté** dans l'ADR (table courte) ; colonne et index trigrammes si elle grandit  |
| Basse : le code cite l'ADR-0062, pas encore écrite au moment de la relecture        | ADR-0062 écrite                                                                      |
| Info : commentaire inexact (« nom entouré d'espaces »)                              | Commentaire corrigé                                                                  |
| Info : « Ÿ » majuscule non converti (devient une espace)                            | Ajouté à la conversion ; « Œ » et « ß » restent des espaces, comme dans `searchable` |
| Info : adresse, nom et ville de la boutique sans règle dans le contrat              | Adresse limitée à `[a-z0-9-]` (80), nom et ville à 60 caractères                     |

Sans problème selon la relecture : mots passés en paramètres SQL et limités à `[a-z0-9]` (aucun `%`, `_` ou `\` dans
`LIKE`, vérifié par un test) ; limite plafonnée ; boutique en attente ou suspendue jamais proposée (test) ; ni
identifiant interne, ni téléphone, ni propriétaire dans la réponse ; adresse `/boutique/…` construite par le site
après vérification (adresse piégée `../vendeur` refusée, test) ; texte affiché par React ; 1 requête par frappe,
2 au plus ; aucun secret dans les tests.

## 5. Qualité

- Format et lint sur tout le dépôt, typecheck et build : ✓.
- Tests unitaires : API **658** ✓ (+1), site **501** ✓ (cas des boutiques ajoutés aux tests existants), contrat
  **34** ✓.
- Intégration sur une base PostgreSQL neuve : **257** ✓ (+1).
- `pnpm audit --audit-level high --prod` : aucune faille haute ou critique (1 moyenne, sous le seuil) ; Gitleaks
  v8.30.1 ✓ ; bout en bout, performance, Semgrep, CodeQL et ZAP : par la CI.

## 6. Captures d'écran

Visible sur la démo après le déploiement (taper « kemdi » dans la recherche) ; le parcours de bout en bout de la CI
vérifie la ligne et le lien vers la boutique officielle.

## 7. Limites connues / dette technique

- Lecture complète de la table des boutiques à chaque suggestion : à indexer au-delà de quelques milliers de boutiques.
- La page de résultats (`/recherche`) ne liste pas encore de boutiques : seules les suggestions les proposent.
- Un nom écrit dans un autre alphabet que le latin ne serait pas trouvé.

## 8. Prochaines étapes

- Aucune migration. Après la fusion, attendre « Déploiement DÉMO (Render) ».
- Suite : S8-T06 (filtre et tri par prix sur la page d'une boutique), S8-T07 (caches de l'API en base).
