/**
 * Règles des données personnelles (S7-T08, ADR-0047 ; loi gabonaise n°001/2011 modifiée par la loi n°025/2023).
 */

/** Ce qui empêche de supprimer un compte maintenant (codes stables, renvoyés par l'API dans le champ `code`). */
export const DELETION_BLOCKERS = [
  "COMMANDE_EN_COURS",
  "REMBOURSEMENT_EN_ATTENTE",
  "PAIEMENT_EN_ATTENTE",
  "BOUTIQUE_OUVERTE",
  "COMPTE_EQUIPE",
] as const;
export type DeletionBlocker = (typeof DELETION_BLOCKERS)[number];

export const BLOCKER_MESSAGES: Record<DeletionBlocker, string> = {
  COMMANDE_EN_COURS:
    "une commande est encore en cours : attendez sa livraison ou son annulation avant de supprimer le compte",
  REMBOURSEMENT_EN_ATTENTE:
    "un remboursement doit encore vous être versé : la suppression sera possible ensuite",
  PAIEMENT_EN_ATTENTE:
    "un paiement Mobile Money attend encore la réponse de l'opérateur : réessayez dans 24 heures",
  BOUTIQUE_OUVERTE:
    "votre boutique est ouverte, en attente ou suspendue : demandez sa fermeture avant de supprimer le compte",
  COMPTE_EQUIPE: "compte de l'équipe Kemdia : un administrateur doit d'abord retirer vos rôles",
};

/** Codes connus, sans doublon, dans l'ordre de `DELETION_BLOCKERS` (ce que renvoient les modules est filtré). */
export function normalizeBlockers(codes: readonly string[]): DeletionBlocker[] {
  return DELETION_BLOCKERS.filter((code) => codes.includes(code));
}

/** Conservation des comptes inactifs (choix du 2026-10-19) : 3 ans sans connexion, prévenu 30 jours avant. */
export const INACTIVITY = { years: 3, noticeDays: 30 } as const;
const DAY_MS = 86_400_000;

/**
 * Bornes du passage de la nuit, à l'instant `now` :
 * - `notifyBefore` : sans activité depuis avant cette date → prévenir (effacement dans 30 jours) ;
 * - `noticedBefore` : prévenu avant cette date et toujours inactif → effacer ;
 * - `deleteOn` : date d'effacement annoncée à un compte prévenu maintenant.
 */
export function inactivityBounds(now: Date): {
  notifyBefore: Date;
  noticedBefore: Date;
  deleteOn: Date;
} {
  const limit = new Date(now);
  limit.setUTCFullYear(limit.getUTCFullYear() - INACTIVITY.years);
  const notice = INACTIVITY.noticeDays * DAY_MS;
  return {
    notifyBefore: new Date(limit.getTime() + notice),
    noticedBefore: new Date(now.getTime() - notice),
    deleteOn: new Date(now.getTime() + notice),
  };
}

/** Le compte ne peut pas être supprimé maintenant. Le message est lisible par un humain, en français. */
export class PrivacyError extends Error {
  constructor(
    readonly code: DeletionBlocker,
    message: string = BLOCKER_MESSAGES[code],
  ) {
    super(message);
    this.name = "PrivacyError";
  }
}
