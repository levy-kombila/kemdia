/**
 * Bêta fermée (S8-T02, ADR-0057) : quand l'inscription est fermée, seule une adresse invitée par l'équipe peut créer
 * un compte. Une invitation vaut 30 jours, sert une seule fois et peut être annulée ; inviter de nouveau la même
 * adresse repart pour 30 jours. Les comptes déjà créés se connectent toujours.
 */

export const BETA_INVITATION_KINDS = ["partner_vendor", "tester"] as const;
export type BetaInvitationKind = (typeof BETA_INVITATION_KINDS)[number];
export type BetaInvitationStatus = "active" | "used" | "expired" | "revoked";

/** Durée d'une invitation (même valeur que BETA_INVITATION_TTL_DAYS du contrat). */
export const BETA_INVITATION_TTL_DAYS = 30;
const DAY_MS = 24 * 60 * 60_000;

export interface BetaInvitation {
  id: string;
  /** E-mail ou mobile normalisés (comme sur le compte) */
  identifier: string;
  kind: BetaInvitationKind;
  invitedBy: string | null;
  usedBy: string | null;
  usedAt: Date | null;
  revokedAt: Date | null;
  expiresAt: Date;
  /** Dernière invitation ou relance */
  createdAt: Date;
}

export interface BetaSettings {
  closed: boolean;
  /** `null` : jamais changé depuis la migration */
  updatedBy: string | null;
  updatedAt: Date | null;
}

export function invitationStatus(invitation: BetaInvitation, now: Date): BetaInvitationStatus {
  if (invitation.usedAt) return "used";
  if (invitation.revokedAt) return "revoked";
  return invitation.expiresAt <= now ? "expired" : "active";
}

/** Nouvelle invitation, ou relance d'une invitation expirée ou annulée (même ligne, mêmes 30 jours). */
export function issueInvitation(input: {
  id: string;
  identifier: string;
  kind: BetaInvitationKind;
  invitedBy: string;
  now: Date;
}): BetaInvitation {
  return {
    id: input.id,
    identifier: input.identifier,
    kind: input.kind,
    invitedBy: input.invitedBy,
    usedBy: null,
    usedAt: null,
    revokedAt: null,
    expiresAt: new Date(input.now.getTime() + BETA_INVITATION_TTL_DAYS * DAY_MS),
    createdAt: input.now,
  };
}
