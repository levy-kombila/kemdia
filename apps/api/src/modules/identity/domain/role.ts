import { IdentityError } from "./identity-error.js";

/**
 * Rôles (RBAC, S4-T06, ADR-0020). Cumulables : un vendeur reste client.
 *
 * - `client` : tout compte actif ; jamais stocké.
 * - `vendor` (vendeur, S6), `moderator` (modération des produits et des avis, S6), `admin` (administration).
 * - Hiérarchie : `admin` a aussi les droits de `moderator`. `vendor` est à part (aucun droit d'équipe).
 *
 * Règles d'attribution (CRIT-06, MED-07 de l'audit Django) :
 * - seul un administrateur accorde ou retire un rôle, et seulement `vendor` ou `moderator` ;
 * - `admin` ne s'accorde JAMAIS par l'API : seulement par la commande serveur `admin:grant` ;
 * - personne ne modifie ses propres rôles.
 */
export const ROLES = ["client", "vendor", "moderator", "admin"] as const;
export type Role = (typeof ROLES)[number];

/** Rôles enregistrés en base (`client` est implicite). */
export type StoredRole = Exclude<Role, "client">;
export const STORED_ROLES: readonly StoredRole[] = ["vendor", "moderator", "admin"];

/** Rôles qu'un administrateur peut accorder ou retirer par l'API. */
export const ADMIN_ASSIGNABLE_ROLES = ["vendor", "moderator"] as const;
export type AssignableRole = (typeof ADMIN_ASSIGNABLE_ROLES)[number];

/** Rôle impliqué par un autre : un administrateur a les droits d'un modérateur. */
const IMPLIES: Record<Role, readonly Role[]> = {
  client: [],
  vendor: [],
  moderator: [],
  admin: ["moderator"],
};

/** Connexion « récente » exigée par les routes d'administration (ADR-0020) : 15 minutes. */
export const RECENT_LOGIN_MS = 15 * 60_000;

export function isStoredRole(value: string): value is StoredRole {
  return (STORED_ROLES as readonly string[]).includes(value);
}

export function isAssignableRole(value: string): value is AssignableRole {
  return (ADMIN_ASSIGNABLE_ROLES as readonly string[]).includes(value);
}

/** Les rôles d'un compte actif, dans l'ordre de ROLES : toujours `client`, puis ceux enregistrés. */
export function effectiveRoles(stored: readonly StoredRole[]): Role[] {
  return ROLES.filter((role) => role === "client" || stored.includes(role));
}

/** Ces rôles donnent-ils les droits de `required` ? */
export function hasRole(roles: readonly Role[], required: Role): boolean {
  return roles.some((role) => role === required || IMPLIES[role].includes(required));
}

/** La session a-t-elle été ouverte (mot de passe ou code saisi) il y a moins de 15 minutes ? */
export function isRecentLogin(openedAt: Date, now: Date): boolean {
  const age = now.getTime() - openedAt.getTime();
  return age >= 0 && age < RECENT_LOGIN_MS;
}

export interface RoleChange {
  actorId: string;
  actorRoles: readonly Role[];
  targetId: string;
  role: string;
}

/**
 * Un administrateur peut-il accorder ou retirer ce rôle à ce compte ? Vérifié dans le cas d'utilisation,
 * EN PLUS de la garde HTTP : la règle tient même si une route est mal protégée.
 */
export function assertCanChangeRole(change: RoleChange): asserts change is RoleChange & {
  role: AssignableRole;
} {
  if (!hasRole(change.actorRoles, "admin")) {
    throw new IdentityError("ACCES_REFUSE", "action réservée à l'administration");
  }
  if (!isAssignableRole(change.role)) {
    throw new IdentityError(
      "ROLE_NON_ATTRIBUABLE",
      "ce rôle ne s'accorde pas ici : seuls « vendeur » et « modérateur » peuvent l'être",
    );
  }
  // Comparaison sans casse, comme PostgreSQL pour les UUID (relecture de sécurité S4-T06)
  if (change.actorId.toLowerCase() === change.targetId.toLowerCase()) {
    throw new IdentityError(
      "ROLE_SUR_SOI_INTERDIT",
      "vous ne pouvez pas modifier vos propres rôles",
    );
  }
}
