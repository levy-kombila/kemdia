import { createHash } from "node:crypto";

/**
 * Ticket d'inscription (ADR-0016) : secret aléatoire remis à celui qui remplit le formulaire d'inscription,
 * exigé pour vérifier le code ou en redemander un. Le site le garde dans un cookie `HttpOnly` (S4-T05).
 *
 * Le ticket PORTE l'inscription (prénom, nom, hachage du mot de passe) : le compte n'est créé qu'à la vérification,
 * avec les données du ticket vérifié. Une deuxième personne qui s'inscrit avec la même adresse remplace le ticket
 * (une seule inscription en cours par adresse) ; elle n'a jamais le code, envoyé au vrai titulaire.
 *
 * Quand l'adresse a déjà un compte, un ticket « leurre » (sans inscription) est créé : il se comporte comme un vrai
 * (même réponse, mêmes limites), mais ne peut rien valider. Personne ne peut deviner qui est client.
 */
export const SIGNUP_TICKET_TTL_MS = 24 * 60 * 60_000;
/** 32 octets en base64url */
export const SIGNUP_TICKET_PATTERN = /^[A-Za-z0-9_-]{43}$/;

/** Empreinte enregistrée en base : le ticket lui-même n'est jamais conservé. */
export function hashSignupTicket(ticket: string): string {
  return createHash("sha256").update(ticket).digest("hex");
}

export interface SignupTicket {
  id: string;
  ticketHash: string;
  /** Identifiant normalisé auquel le code est envoyé */
  destination: string;
  /** `null` : ticket leurre (l'identifiant a déjà un compte) */
  registration: { firstName: string; lastName: string; passwordHash: string } | null;
  expiresAt: Date;
  createdAt: Date;
}
