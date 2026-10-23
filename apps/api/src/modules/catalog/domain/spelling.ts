/**
 * Correction des fautes de frappe de la recherche (S7.5-T06, ADR-0053).
 *
 * La base propose des mots proches (trigrammes, pg_trgm) ; ici on choisit le meilleur avec une distance d'édition
 * qui compte une inversion de deux lettres comme UNE faute (« ipohne » → « iphone ») et on refuse les mots trop
 * éloignés : mieux vaut « aucun résultat » qu'un résultat hors sujet.
 */

/** En dessous de cette longueur, un mot n'est jamais corrigé (« tv », « pc » : trop de mots proches). */
export const MIN_CORRECTABLE_LENGTH = 3;

/** Fautes tolérées selon la longueur du mot tapé : 1 jusqu'à 4 lettres, 2 jusqu'à 7, 3 au-delà. */
export function allowedTypos(length: number): number {
  if (length <= 4) return 1;
  if (length <= 7) return 2;
  return 3;
}

/**
 * Distance d'édition « optimal string alignment » (Damerau restreint) : ajout, suppression, remplacement et inversion
 * de deux lettres voisines comptent chacun pour 1. Arrêt dès que la distance dépasse `max` (mots courts : 30 lettres
 * au plus, voir `closestWord`).
 */
export function editDistance(a: string, b: string, max = Infinity): number {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let prev2: number[] = [];
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const row = [i];
    let best = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let d = Math.min(prev[j]! + 1, row[j - 1]! + 1, prev[j - 1]! + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        d = Math.min(d, prev2[j - 2]! + 1);
      }
      row.push(d);
      best = Math.min(best, d);
    }
    if (best > max) return max + 1;
    prev2 = prev;
    prev = row;
  }
  return prev[b.length]!;
}

/**
 * Meilleur remplaçant de `term` parmi `candidates` (mots du catalogue, du plus ressemblant au moins ressemblant).
 * - `term` lui-même, s'il est contenu dans un mot du catalogue (mot exact, ou début de mot en cours de frappe) ;
 * - sinon le mot le plus proche dans la limite des fautes tolérées (à égalité : le premier, le plus ressemblant) ;
 * - `null` si aucun mot n'est assez proche.
 */
export function closestWord(term: string, candidates: readonly string[]): string | null {
  if (candidates.some((word) => word.includes(term))) return term;
  if (term.length < MIN_CORRECTABLE_LENGTH || term.length > 30) return null;
  const max = allowedTypos(term.length);
  let best: string | null = null;
  let bestDistance = max + 1;
  for (const word of candidates) {
    if (word.length > 30) continue;
    const distance = editDistance(term, word, max);
    if (distance < bestDistance) {
      best = word;
      bestDistance = distance;
    }
  }
  return best;
}
