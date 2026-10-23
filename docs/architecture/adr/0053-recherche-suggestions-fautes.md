# ADR-0053 — Recherche : suggestions pendant la frappe et tolérance aux fautes

- **Statut** : Accepté
- **Date** : 2026-10-23
- **Tâche** : S7.5-T06
- **Complète** : [ADR-0008](0008-postgresql-prisma.md) (PostgreSQL et Prisma),
  [ADR-0049](0049-fiches-communes-offres.md) (fiches communes : la recherche porte sur les fiches)

## Contexte

La recherche (`GET /products?q=`) gardait une fiche seulement si son texte de recherche (`search_text` : titre,
marque, catégorie et caractéristiques, en minuscules sans accents) contenait **exactement** chaque mot tapé. La moindre
faute de frappe (« ipohne », « sennhieser ») donnait « Aucun résultat ». Le champ de recherche ne proposait rien
pendant la frappe. Aucun index ne servait cette recherche.

Choix du propriétaire (2026-10-23) :

| Question                       | Choix                                                                        |
| ------------------------------ | ---------------------------------------------------------------------------- |
| Comment tolérer les fautes     | **pg_trgm dans PostgreSQL** (extension + index), pas de service en plus      |
| Quand chercher « approché »    | **Seulement si la recherche exacte ne trouve rien**, avec un lien « exacte » |
| Que suggérer pendant la frappe | **Produits + rayons + marques** (8 au plus) ; les boutiques viendront au T07 |
| Quand suggérer                 | **Dès 2 lettres, après 250 ms sans frappe**                                  |

## Décision

1. **Extension `pg_trgm` et index trigrammes** (migration `20261023090000_recherche_approchee`) : index GIN
   `gin_trgm_ops` sur `catalog.listings.search_text`. Il sert la recherche approchée (opérateur `<%`) et accélère aussi
   la recherche exacte (`LIKE '%mot%'`). L'extension est « de confiance » depuis PostgreSQL 13 : le propriétaire de la
   base l'installe sans être superutilisateur (Render compris). L'index est aussi déclaré dans le schéma Prisma
   (`db:check` reste sans écart).
2. **Correction des mots, seulement si la recherche exacte ne trouve rien.** Le service compte d'abord les fiches
   visibles qui contiennent les mots tapés (catégorie, sélection et page Promotions comprises, **filtres du client non
   compris** : la décision est la même pour la liste et pour les compteurs). Si le compte est nul, en **une seule requête** pour tous les mots (une seule connexion), pour chaque mot :
   - la base renvoie les mots des fiches visibles qui lui ressemblent (trigrammes, seuil abaissé à 0,3 pour cette
     seule transaction : une inversion de lettres casse beaucoup de trigrammes) ;
   - un mot déjà présent dans une fiche visible n'est **jamais** corrigé ;
   - le domaine choisit le plus proche avec une **distance d'édition** où une inversion de deux lettres voisines compte
     pour une faute ; tolérance : **1 faute jusqu'à 4 lettres, 2 jusqu'à 7, 3 au-delà** ; un mot de moins de 3 lettres
     n'est jamais corrigé ;
   - si UN mot n'a aucun remplaçant assez proche, rien n'est corrigé (mieux vaut « aucun résultat » qu'un résultat hors
     sujet).
     La liste est alors celle des mots corrigés, et la réponse porte `correctedQuery`. `exact=1` désactive la correction.
     Protections (relecture de sécurité) : une correction est **gardée 30 s** en mémoire (la liste et ses compteurs ne
     la paient qu'une fois) ; **120 corrections cherchées en base par minute** au plus, tous visiteurs confondus
     (au-delà : recherche telle quelle) ; pas de correction si les mots corrigés dépassent 100 caractères.
3. **Suggestions** : `GET /products/suggestions?q=` (publique, 20 appels par minute et par adresse, soit 60 par visiteur via le site) : 4 produits (ordre
   « pertinence »), 2 rayons dont le nom contient les mots, 2 marques dont le nom contient un mot ; le dernier mot peut
   être incomplet (« senn » trouve « sennheiser »). Même correction que la liste. Moins de 2 lettres : listes vides.
   Réponse réduite au nécessaire (adresse, titre, photo, prix).
4. **Site.** Le champ de recherche reste un formulaire GET natif (il marche sans JavaScript) ; avec le JavaScript, il
   devient une « combobox » accessible (flèches, Entrée, Échap, nombre de suggestions annoncé). Il appelle le relais
   `/recherche/suggestions` du site (même origine), qui appelle l'API avec la clé interne **et l'adresse du visiteur**,
   sans cache partagé : la limite de l'API compte par visiteur (compteur commun « inconnue » si l'en-tête de l'adresse n'est pas configuré). Le navigateur vérifie la forme de la réponse sans
   embarquer les schémas Zod dans toutes les pages. La page de résultats affiche « Aucun résultat pour « ipohne ».
   Résultats pour « iphone ». Chercher exactement « ipohne » ».
5. **Contrat 2.2.0** : nouvelle route, `correctedQuery` (facultatif) dans `ProductPage`, paramètre `exact`.

## Conséquences

- Une faute de frappe courante ne mène plus à une page vide ; le client voit toujours quels mots ont été utilisés.
- Une recherche avec mots corrigés coûte deux requêtes de plus (un compte, puis une requête de mots proches pour tous
  les mots), servies par l'index trigrammes. Une recherche qui trouve directement ne coûte qu'un compte de plus.
- Cache et budget des corrections en mémoire : ils repartent de zéro au redémarrage et ne tiennent pas avec plusieurs
  instances de l'API (une seule au MVP).
- L'index est créé sans `CONCURRENTLY` : il bloque les écritures sur les fiches quelques instants pendant la
  migration (négligeable avec le catalogue actuel).
- La correction ne connaît que les mots du catalogue visible : un mot juste mais absent du catalogue n'est jamais
  « corrigé » vers un autre produit s'il en est trop éloigné.
- Nouvelle migration : `db:deploy` puis `db:check` après la fusion.

## Alternatives écartées

- **Moteur de recherche externe** (Meilisearch, Elasticsearch) : un service de plus à héberger, à payer et à tenir à
  jour depuis la base ; disproportionné pour la taille du catalogue.
- **Distance d'édition seule, côté API**, sur tout le vocabulaire : il faudrait charger tous les mots du catalogue en
  mémoire et les tenir à jour ; lent quand le catalogue grossit.
- **Toujours mélanger résultats exacts et approchés** : plus de résultats, mais souvent hors sujet (« coque » trouverait
  « cuque »…). Écarté par le propriétaire.
- **Recherches populaires dans les suggestions** : demanderait d'enregistrer ce que tapent les clients (données à
  protéger) ; non retenu.
