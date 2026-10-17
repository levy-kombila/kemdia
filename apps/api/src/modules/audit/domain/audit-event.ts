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
  /** Commande annulée par un administrateur (détails : reference, previousStatus, refund) — S5-T04 */
  "order.cancelled_by_admin",
  /** Remboursement noté fait (détails : reference, amount, externalReference) — S5-T04 */
  "refund.done",
  /** Paiement à la livraison encaissé (détails : reference, amount) — S5-T04 */
  "cod.collected",
  /** Réglage du paiement à la livraison changé (détails : zones, maxTotal) — S5-T04 */
  "settings.cod_updated",
  /** Informations de l'entreprise sur les factures changées (détails : legalName, taxId) — S5-T06 */
  "settings.billing_updated",
  /** Demande de boutique envoyée ou renvoyée après un refus (détails : name, previousName) — S6-T01 */
  "shop.requested",
  /** Boutique validée ou réactivée ; le rôle vendeur est accordé à part (détails : name, from, to) — S6-T01 */
  "shop.approved",
  /** Demande de boutique refusée (détails : name, from, to, reason) — S6-T01 */
  "shop.rejected",
  /** Boutique suspendue ; le rôle vendeur est retiré à part (détails : name, from, to, reason) — S6-T01 */
  "shop.suspended",
  /** Produit d'un vendeur envoyé en modération : création, contenu modifié, remise en vente, photo ajoutée (détails : title, reason, from ; image et sha256 pour une photo, S6-T04) — S6-T02 */
  "product.submitted",
  /** Produit validé par la modération (détails : title, from, to) — S6-T02 */
  "product.approved",
  /** Produit refusé par la modération (détails : title, from, to, reason) — S6-T02 */
  "product.rejected",
  /** Produit retiré de la vente par son vendeur (détails : title, from) — S6-T02 */
  "product.archived",
  /** Prix, prix barré, stock ou activation d'une variante changés par le vendeur (détails : sku, avant / après) — S6-T02 */
  "product.variant_updated",
  /** Photo retirée par le vendeur, et effacée (détails : title, image, sha256) — S6-T04 */
  "product.image_removed",
  /** Nouvel ordre des photos, sans modération (détails : title) — S6-T04 */
  "product.images_reordered",
  /** Double authentification activée par son titulaire (aucun détail) — S6-T03 */
  "mfa.enabled",
  /** Code de secours utilisé (détails : remaining) — S6-T03 */
  "mfa.recovery_used",
  /** Nouveaux codes de secours (aucun détail) — S6-T03 */
  "mfa.recovery_regenerated",
  /** Mot de passe ou code de double authentification faux (détails : attempts, today) — S6-T03 */
  "mfa.failed",
  /** 3 échecs en 15 min (session fermée) ou 10 en 24 h (toutes les sessions fermées) (détails : attempts, scope) — S6-T03 */
  "mfa.locked",
  /** Double authentification remise à zéro par la commande serveur (détails : source, sessionsClosed) — S6-T03 */
  "mfa.reset",
  /** Commande acceptée par une boutique (détails : reference, shop, preparing) — S6-T07 */
  "order.vendor_accepted",
  /** Commande refusée par une boutique : commande entière annulée (détails : reference, shop, reason, refunds) — S6-T07 */
  "order.vendor_refused",
  /** Boutique sans réponse dans les 24 h : commande entière annulée, au nom du serveur (détails : reference, shops) — S6-T07 */
  "order.vendor_timeout",
  /** Dossier de vérification créé ou modifié par le vendeur (détails : idType, payoutMethod ; jamais un numéro) — S6-T08 */
  "kyc.updated",
  /** Photo du dossier envoyée ou remplacée (détails : kind) — S6-T08 */
  "kyc.document_added",
  /** Dossier envoyé à l'équipe — S6-T08 */
  "kyc.submitted",
  /** Dossier ouvert par un administrateur (numéros complets affichés) — S6-T08 */
  "kyc.viewed",
  /** Photo du dossier regardée par un administrateur (détails : kind) — S6-T08 */
  "kyc.document_viewed",
  /** Dossier validé : les versements deviennent possibles (BR-024) — S6-T08 */
  "kyc.approved",
  /** Dossier refusé (détails : reason) — S6-T08 */
  "kyc.rejected",
] as const;
export type AuditAction = (typeof AUDIT_ACTIONS)[number];

/** Durée de conservation (ADR-0020). La même valeur est écrite dans le déclencheur SQL. */
export const AUDIT_RETENTION_DAYS = 365;

/** Qui agit : un compte, ou le serveur lui-même (commande en ligne, tâche planifiée). */
export type AuditActor = { type: "account"; id: string } | { type: "system" };

export const AUDIT_TARGET_TYPES = [
  "account",
  "coupon",
  "order",
  "refund",
  "shop",
  "product",
] as const;
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
