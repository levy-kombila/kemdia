# ADR-0064 — Compteurs partagés en base, avant plusieurs instances de l'API

- **Statut** : Accepté
- **Date** : 2026-10-27
- **Tâche** : S8-T07 (dette S7.5)
- **Remplace en partie** : [ADR-0021](0021-csrf-csp-limites.md) (limites « en mémoire de l'API »)

## Contexte

Plusieurs règles de sécurité reposaient sur des compteurs gardés dans la mémoire du processus de l'API :

| Compteur                               | Module                              | Règle                                                                 |
| -------------------------------------- | ----------------------------------- | --------------------------------------------------------------------- |
| Limites de débit par adresse et compte | `http`, `identity` (`SessionGuard`) | 120/min par adresse (×3 via le site), 120/min par compte et par route |
| Codes coupons refusés                  | `orders`                            | 10 refus en 15 minutes par compte                                     |
| Renvois de factures                    | `payments`                          | 1 par facture en 10 minutes, 5 par client et par heure                |
| Budget des corrections de la recherche | `catalog`                           | 120 corrections par minute en tout                                    |

Avec deux instances, chaque limite serait multipliée par deux (un attaquant répartit ses essais), et deux clics sur
« Renvoyer » reçus par deux instances passeraient tous les deux.

## Décision

1. Une table **`platform.rate_counters`** (nouveau schéma `platform` : état partagé hors modules métier, fichier
   `platform.prisma`) : une ligne par clé, **fenêtre fixe** (le premier appel l'ouvre), **blocage** optionnel au-delà
   d'une limite. Lue et écrite seulement par `src/database/rate-counters.ts` ; chaque module la voit comme son propre
   port (`SharedCounters`) branché dans sa couche infrastructure.
2. Chaque comptage est **une seule requête** (`INSERT … ON CONFLICT DO UPDATE … RETURNING`) : deux instances qui
   comptent en même temps ne perdent aucun appel (vérifié avec 40 appels simultanés).
3. **Limites de débit** : stockage de `@nestjs/throttler` remplacé par ces compteurs (`CountersThrottlerStorage`) ;
   même limite, même blocage, même en-tête `Retry-After`. **Coupons** : un essai est réservé AVANT de vérifier le code
   (essais simultanés tous comptés), puis annulé s'il n'était pas un refus de coupon. **Renvois** : réservation
   atomique par facture puis par client, annulée si l'envoi échoue. **Recherche** : budget commun.
4. **Repli** : si la base ne répond pas, ou met plus de **500 ms**, l'instance continue avec des compteurs en mémoire
   (comme avant) et l'écrit dans le journal (une fois par minute, sans clé ni adresse). Une clé que la base a déclarée
   **bloquée** n'est plus écrite par l'instance jusqu'à la fin du blocage.
5. Ménage **toutes les 10 minutes** des compteurs terminés (fenêtre et blocage finis).
6. Réglage **`RATE_LIMIT_STORE`** (`database` ou `memory`) : absent, `memory` pour les tests, `database` sinon ;
   `memory` **refusé en production**. Aucun changement à faire dans les réglages de Render.
7. Restent en mémoire de chaque instance, parce qu'ils ne font que gagner du temps et ne dépendent que du catalogue :
   l'arborescence des rayons (60 s) et les corrections déjà calculées (30 s). L'opérateur de paiement **simulé** garde
   ses demandes en mémoire (démo seulement, jamais en production).

Choix du 2026-10-27 : options recommandées retenues sans être reposées (ta demande du 2026-10-23).

## Conséquences

- Plusieurs instances de l'API appliquent ensemble les mêmes limites (vérifié : deux instances, 10 appels par minute
  en tout, le 11e refusé).
- Une écriture en base par requête limitée (petite ligne, clé primaire) ; une rafale bloquée ne coûte qu'une écriture
  par instance.
- **Migration** `20261027120000_compteurs_partages` (schéma `platform`, une table) : `db:deploy` puis `db:check` sur
  la démo. Avant cela, l'API fonctionne en repli (limites par instance, comme avant).
- Aucun changement de l'API ni du contrat.

### Risques acceptés

- **Fenêtre fixe** au lieu de la fenêtre glissante pour les coupons et les renvois (relecture, moyenne) : à la
  frontière de deux fenêtres, jusqu'à 2 fois la limite (20 refus de coupons en peu de temps, 10 renvois à un client).
  Les limites de débit étaient déjà à fenêtre fixe.
- **Connexions** : un comptage utilise une connexion du pool, aussi pendant la création d'une commande (relecture,
  moyenne) ; le délai de 500 ms et le repli évitent l'attente ; un pool séparé si la charge le demande.
- Clé globale du budget de la recherche : une seule ligne verrouillée à chaque correction (bornée par les limites par
  visiteur).
- Le repli affaiblit les limites (par instance) pendant une panne de la base ; il n'est visible que dans le journal,
  pas dans `/api/health` (relecture, basse).
- Horloge de chaque instance utilisée pour les fenêtres (relecture, basse) : un décalage de quelques secondes déforme
  peu une fenêtre d'une minute.
- Un renvoi refusé pendant qu'un autre échoue peut laisser la facture bloquée 10 minutes sans envoi (relecture,
  basse) : ce défaut bloque, il ne laisse rien passer.
- Les clés contiennent l'UUID du compte (`coupon:`, `compte:`, `facture-renvois-client:`) ; l'adresse IP, elle, est
  déjà réduite à une empreinte par `@nestjs/throttler`. Lignes effacées au plus 10 minutes après leur fin.

## Alternatives écartées

- **Redis** : un service de plus à payer et à surveiller, alors que la location du serveur attend le client ; à
  reconsidérer si la charge sur PostgreSQL le demande.
- **Table `UNLOGGED`** (écritures plus rapides) : perdue au redémarrage, donc des blocages oubliés, et `db:check` ne
  sait pas la comparer.
- **Fenêtre glissante en base** (une ligne par appel) : beaucoup plus d'écritures et de ménage pour un gain faible.
- **Tout garder en mémoire et une seule instance** : bloque la montée en charge prévue.
