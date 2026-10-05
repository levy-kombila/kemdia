/**
 * Validation stricte des paramètres d'URL.
 * Leçon de l'audit (MED-13) : le tri venait directement de l'URL vers order_by().
 * Ici, toute valeur inconnue retombe sur une valeur par défaut — jamais d'erreur 500.
 */

export const SORT_OPTIONS = {
  pertinence: "Pertinence",
  nouveautes: "Nouveautés",
  "prix-asc": "Prix croissant",
  "prix-desc": "Prix décroissant",
  note: "Mieux notés",
} as const;

export type SortKey = keyof typeof SORT_OPTIONS;

export function parseSort(value: unknown): SortKey {
  return typeof value === "string" && Object.hasOwn(SORT_OPTIONS, value)
    ? (value as SortKey)
    : "pertinence";
}

export function parsePage(value: unknown, max = 1000): number {
  const n = typeof value === "string" ? Number.parseInt(value, 10) : NaN;
  if (!Number.isFinite(n) || n < 1) return 1;
  return Math.min(n, max);
}

export const MAX_QUERY_LENGTH = 100;

export function parseQuery(value: unknown): string {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, MAX_QUERY_LENGTH);
}

/** Prend la 1re valeur si Next fournit un tableau (?q=a&q=b). */
export function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}
