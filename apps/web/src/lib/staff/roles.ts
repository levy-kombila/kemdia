import type { Role } from "@kemdia/contracts/constants";

/** Équipe Kemdia : modérateurs et administrateurs (un administrateur peut aussi modérer, comme dans l'API). */
export const isStaff = (roles: readonly Role[]) =>
  roles.includes("moderator") || roles.includes("admin");
export const isAdmin = (roles: readonly Role[]) => roles.includes("admin");

/** Page d'accueil de l'espace de l'équipe. */
export const STAFF_HOME = "/equipe";

/**
 * Adresse de retour après la connexion ou la saisie du code : TOUJOURS une page de l'espace de l'équipe, avec des
 * caractères simples (lettres, chiffres, « / », « - », « ? », « = », « & »). Le reste ramène à l'accueil de l'équipe :
 * aucune redirection vers un autre site ni vers une autre partie du site (relecture S6-T05).
 */
const SEGMENT = /^[a-z0-9-]{1,64}$/;
const QUERY = /^[a-zA-Z0-9=&_-]{0,200}$/;

/** Découpage simple (pas d'expression régulière imbriquée, donc aucun risque de ReDoS). */
function isStaffAddress(value: string): boolean {
  const [path = "", query, ...more] = value.split("?");
  if (more.length > 0 || (query !== undefined && !QUERY.test(query))) return false;
  const [root, area, ...segments] = path.split("/");
  return (
    root === "" &&
    area === "equipe" &&
    segments.length <= 4 &&
    segments.every((s) => SEGMENT.test(s))
  );
}

export function staffPath(value: unknown): string {
  if (typeof value !== "string" || value.length > 300) return STAFF_HOME;
  if (!isStaffAddress(value)) return STAFF_HOME;
  // « /equipe/confirmer » et « /equipe/securite » ne sont jamais une destination (boucle)
  if (/^\/equipe\/(?:confirmer|securite)(?:[/?]|$)/.test(value)) return STAFF_HOME;
  return value;
}

/**
 * Heure jusqu'à laquelle la session est confirmée par la double authentification, ou `null` si elle ne l'est pas (ou
 * plus). L'API reste juge ; ceci sert seulement à choisir quoi afficher.
 */
export function confirmedUntil(
  factor: { verifiedUntil: string | null },
  now: number = Date.now(),
): string | null {
  const until = factor.verifiedUntil;
  return until && Date.parse(until) > now ? until : null;
}
