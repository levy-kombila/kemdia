/**
 * Journal d'audit (S4-T06, ADR-0020) : QUI a fait QUOI, sur QUOI, QUAND et d'OÙ, pour les actions sensibles.
 *
 * - Liste FERMÉE d'actions : un module qui veut journaliser une nouvelle action l'ajoute ici (revue de code).
 * - Jamais de secret : ni mot de passe, ni code, ni jeton, ni empreinte. Les détails sont de courtes valeurs.
 * - Conservé 365 jours, puis purgé ; la base refuse toute modification (déclencheurs SQL).
 */

export const AUDIT_ACTIONS = [
  /** Un rôle a été accordé à un compte (détails : role, source) */
  "role.granted",
  /** Un rôle a été retiré à un compte (détails : role, source) */
  "role.revoked",
  /** Mot de passe changé par « mot de passe oublié » : toutes les sessions fermées */
  "password.reset",
  /** « Déconnecter tous mes appareils » (détails : count) */
  "sessions.revoked_all",
  /** Coupon créé par un administrateur (détails : code, kind, value) — S5-T03 */
  "coupon.created",
  /** Coupon activé ou désactivé (détails : code, active) — S5-T03 */
  "coupon.updated",
] as const;
export type AuditAction = (typeof AUDIT_ACTIONS)[number];

/** Durée de conservation (ADR-0020). La même valeur est écrite dans le déclencheur SQL. */
export const AUDIT_RETENTION_DAYS = 365;

/** Qui agit : un compte, ou le serveur lui-même (commande en ligne, tâche planifiée). */
export type AuditActor = { type: "account"; id: string } | { type: "system" };

export const AUDIT_TARGET_TYPES = ["account", "coupon"] as const;
export type AuditTargetType = (typeof AUDIT_TARGET_TYPES)[number];

export interface AuditTarget {
  type: AuditTargetType;
  id: string;
}

/** D'où vient la requête : adresse IP vue par l'API et identifiant de requête des journaux techniques. */
export interface AuditContext {
  ip: string | null;
  requestId: string | null;
}

/** Aucune requête HTTP (commande en ligne, tâche planifiée). */
export const NO_REQUEST: AuditContext = { ip: null, requestId: null };

export type AuditDetails = Readonly<Record<string, string | number>>;

export interface AuditEntry {
  action: AuditAction;
  actor: AuditActor;
  target: AuditTarget | null;
  details: AuditDetails;
  context: AuditContext;
}

export interface AuditEvent extends AuditEntry {
  id: string;
  /** Date posée par la BASE à l'écriture (jamais par l'API : impossible d'antidater une ligne) */
  occurredAt: Date;
}

export const MAX_DETAILS = 8;
export const MAX_DETAIL_LENGTH = 100;
const DETAIL_KEY = /^[a-zA-Z][a-zA-Z0-9]{0,29}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
/** Caractères de contrôle (retours à la ligne, nul…) : rien d'injectable dans un affichage ou un export */
const CONTROL = /\p{Cc}/u;

/**
 * Vérifie une entrée avant écriture. Une entrée invalide est une ERREUR DE PROGRAMMATION (jamais une donnée
 * de l'utilisateur) : on refuse plutôt que d'écrire n'importe quoi dans le journal.
 */
export function assertValidEntry(entry: AuditEntry): void {
  const fail = (why: string): never => {
    throw new Error(`entrée de journal d'audit invalide (${entry.action}) : ${why}`);
  };
  if (!AUDIT_ACTIONS.includes(entry.action)) fail("action inconnue");
  if (entry.actor.type === "account" && !UUID.test(entry.actor.id)) fail("acteur");
  if (entry.target) {
    if (!AUDIT_TARGET_TYPES.includes(entry.target.type) || !UUID.test(entry.target.id))
      fail("cible");
  }
  const details = Object.entries(entry.details);
  if (details.length > MAX_DETAILS) fail("trop de détails");
  for (const [key, value] of details) {
    if (!DETAIL_KEY.test(key)) fail(`clé « ${key} »`);
    if (typeof value === "number") {
      if (!Number.isSafeInteger(value)) fail(`valeur de « ${key} »`);
    } else if (value.length > MAX_DETAIL_LENGTH || CONTROL.test(value)) {
      fail(`valeur de « ${key} »`);
    }
  }
}
