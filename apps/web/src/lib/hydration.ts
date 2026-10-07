/**
 * Première hydratation de la page terminée ? (S3-T08, voir components/home/HydrateWhenVisible.tsx)
 * Passe à `true` dans un effet de `Providers` (racine de l'application) : les effets ne s'exécutent
 * qu'après l'hydratation. Ensuite, toute page ouverte par navigation côté client est rendue directement.
 */
let done = false;

export function markFirstHydrationDone(): void {
  done = true;
}

export function isFirstHydrationDone(): boolean {
  return done;
}
