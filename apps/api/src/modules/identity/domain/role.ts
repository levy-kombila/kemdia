import { IdentityError } from "./identity-error.js";

/**
 * Rôles (RBAC, S4-T06, ADR-0020 ; rôles détaillés de l'équipe S7.5-T04, ADR-0051). Cumulables : un vendeur reste client.
 *
 * - `client` : tout compte actif ; jamais stocké.
 * - `vendor` (vendeur) ; équipe : `catalog` (produits, fiches, boutiques, vérifications), `logistics` (livraisons),
 *   `finance` (paiements, remboursements, encaissements, factures, codes promo), `support` (service client, lecture
 *   seule), `admin` (administration).
 * - Hiérarchie : `admin` a aussi les droits des quatre autres rôles de l'équipe. `vendor` est à part.
 *
 * Règles d'attribution (CRIT-06, MED-07 de l'audit Django) :
 * - seul un administrateur accorde ou retire un rôle, et jamais `admin` ;
 * - `admin` ne s'accorde JAMAIS par l'API : seulement par la commande serveur `admin:grant` ;
 * - personne ne modifie ses propres rôles.
 */
export const ROLES = [
  "client",
  "vendor",
  "catalog",
  "logistics",
  "finance",
  "support",
  "admin",
] as const;
export type Role = (typeof ROLES)[number];

/** Rôles de l'équipe Kemdia : double authentification obligatoire. */
export const STAFF_ROLES = ["catalog", "logistics", "finance", "support", "admin"] as const;
export type StaffRole = (typeof STAFF_ROLES)[number];

/** Rôles qu'un administrateur peut accorder ou retirer par l'API (jamais `admin`). */
export const ADMIN_ASSIGNABLE_ROLES = ["vendor", "catalog", "logistics", "finance", "support"] as const;
export type AssignableRole = (typeof ADMIN_ASSIGNABLE_ROLES)[number];

/** Rôles impliqués par un autre : un administrateur a les droits de toute l'équipe. */
export const ROLE_IMPLIES: Readonly<Record<Role, readonly Role[]>> = {
  client: [],
  vendor: [],
  catalog: [],
  logistics: [],
  finance: [],
  support: [],
  admin: ["catalog", "logistics", "finance", "support"],
};

/** Rôles enregistrés en base (`client` est implicite). */
export type StoredRole = Exclude<Role, "client">;
export const STORED_ROLES: readonly StoredRole[] = ROLES.filter(
  (role): role is StoredRole => role !== "client",
);

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
  return roles.some((role) => role === required || ROLE_IMPLIES[role].includes(required));
}

/** Ces rôles font-ils partie de l'équipe (double authentification obligatoire) ? */
export function isStaff(roles: readonly Role[]): boolean {
  return roles.some((role) => (STAFF_ROLES as readonly Role[]).includes(role));
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
      "ce rôle ne s'accorde pas ici : l'administrateur se nomme seulement depuis le serveur",
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
