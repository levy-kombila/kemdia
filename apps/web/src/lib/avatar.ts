/**
 * Photo de profil (S7.5-T08, ADR-0055) : initiales et couleur par défaut, adresse de la photo. Utilisé par le serveur
 * et le navigateur (aucune dépendance).
 */

/** Initiales : première lettre du prénom et du nom (« Awa Ndong » → « AN »). */
export function initialsOf(firstName: string, lastName: string): string {
  const first = (s: string) => [...s.trim()][0] ?? "";
  const letters = `${first(firstName)}${first(lastName)}`.toLocaleUpperCase("fr-FR");
  return letters || "?";
}

/**
 * Fonds des initiales : couleurs foncées sur lesquelles le blanc reste lisible (contraste ≥ 4,5:1). La couleur dépend du
 * nom : toujours la même pour une personne, différente d'une personne à l'autre.
 */
export const AVATAR_COLORS = [
  "#1d4ed8",
  "#047857",
  "#7c3aed",
  "#b45309",
  "#be123c",
  "#0e7490",
  "#4d7c0f",
  "#a21caf",
] as const;

export function avatarColorOf(firstName: string, lastName: string): string {
  let hash = 0;
  for (const char of `${firstName} ${lastName}`.toLocaleLowerCase("fr-FR")) {
    hash = (hash * 31 + char.codePointAt(0)!) >>> 0;
  }
  return AVATAR_COLORS[hash % AVATAR_COLORS.length]!;
}

/** Adresse de la photo : la version change avec la photo, le navigateur peut donc la garder longtemps. */
export function avatarSrc(version: string | null): string | null {
  return version && /^[0-9a-f]{16}$/.test(version) ? `/compte/photo?v=${version}` : null;
}
