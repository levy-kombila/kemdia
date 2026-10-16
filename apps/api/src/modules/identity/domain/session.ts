/**
 * Session ouverte après une connexion (ADR-0015, ADR-0017).
 * - Le site garde le jeton dans un cookie HttpOnly ; la base n'en garde que l'empreinte SHA-256.
 * - 30 jours, prolongés à l'usage : chaque visite repousse la fin (au plus une écriture par heure).
 * - Déconnexion = révocation immédiate ; « déconnecter tous mes appareils » révoque toutes les sessions.
 */
export const SESSION_TTL_MS = 30 * 24 * 60 * 60_000;
/** On ne réécrit la session qu'une fois par heure au plus (pas une écriture par page vue). */
export const SESSION_RENEW_AFTER_MS = 60 * 60_000;
export const USER_AGENT_MAX_LENGTH = 200;

export interface Session {
  id: string;
  accountId: string;
  tokenHash: string;
  expiresAt: Date;
  lastSeenAt: Date;
  revokedAt: Date | null;
  userAgent: string | null;
  /** Version du mot de passe à l'ouverture (ADR-0018) */
  passwordVersion: number;
  /** Dernière confirmation par la double authentification (S6-T03) ; vide : jamais confirmée */
  secondFactorAt: Date | null;
  createdAt: Date;
}

export function isSessionActive(session: Session, now: Date): boolean {
  return session.revokedAt === null && session.expiresAt > now;
}

/** Faut-il prolonger la session (dernière prolongation il y a plus d'une heure) ? */
export function shouldRenew(session: Session, now: Date): boolean {
  return now.getTime() - session.lastSeenAt.getTime() >= SESSION_RENEW_AFTER_MS;
}

/** Navigateur résumé, sans caractères de contrôle, 200 caractères au plus (affiché dans « mes appareils »). */
export function summarizeUserAgent(raw: string | undefined): string | null {
  if (!raw) return null;
  // Caractères de contrôle (retours à la ligne, nul…) remplacés par des espaces : rien d'injectable dans un affichage
  const clean = Array.from(raw, (ch) => {
    const code = ch.charCodeAt(0);
    return code < 32 || code === 127 ? " " : ch;
  })
    .join("")
    .trim();
  return clean ? clean.slice(0, USER_AGENT_MAX_LENGTH) : null;
}
