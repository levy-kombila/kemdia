import { SECRET_PATTERN, hashSecret } from "./secret.js";

/**
 * Ticket de réinitialisation du mot de passe (FR-012, ADR-0018) : remis à celui qui demande « mot de passe oublié »,
 * exigé avec le code pour choisir le nouveau mot de passe. Même principe que le ticket d'inscription (ADR-0016) :
 * - seule son empreinte est gardée ; une nouvelle demande annule les précédentes pour la même adresse ;
 * - adresse sans compte : ticket « leurre » (`accountId` vide), même réponse, AUCUN e-mail, ne valide jamais rien.
 */
export const RESET_TICKET_TTL_MS = 60 * 60_000;
export const RESET_TICKET_PATTERN = SECRET_PATTERN;
export const hashResetTicket = hashSecret;

export interface ResetTicket {
  id: string;
  ticketHash: string;
  destination: string;
  /** `null` : ticket leurre (aucun compte pour cette adresse) */
  accountId: string | null;
  expiresAt: Date;
  createdAt: Date;
}
