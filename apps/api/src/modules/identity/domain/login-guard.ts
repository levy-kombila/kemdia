/**
 * BR-040 : après 3 échecs de connexion, l'identifiant est bloqué 15 minutes (ADR-0017).
 *
 * Compté par IDENTIFIANT (adresse e-mail ou numéro normalisé), qu'un compte existe ou non :
 * le blocage s'applique pareil à une adresse inconnue, donc il ne révèle pas qui est client.
 *
 * Chaque tentative RÉSERVE un essai avant la vérification du mot de passe, en une seule opération en base
 * (voir LoginGuardRepository.claim) : des centaines de tentatives simultanées n'obtiennent que 3 essais.
 * Une connexion réussie remet le compteur à zéro.
 */
export const MAX_LOGIN_ATTEMPTS = 3;
export const LOGIN_LOCK_MS = 15 * 60_000;
/** Les essais s'oublient après 15 minutes sans tentative : « 3 échecs en moins de 15 minutes ». */
export const LOGIN_WINDOW_MS = 15 * 60_000;

export interface LoginGuardState {
  /** Essais réservés depuis la dernière réussite ou la fin du dernier blocage (celui-ci compris) */
  attempts: number;
  /** Fin du blocage, ou `null` */
  lockedUntil: Date | null;
  /** Dernière tentative */
  updatedAt: Date;
}

/**
 * Règle appliquée à chaque réservation (la même en mémoire et en SQL) :
 * - blocage terminé, ou aucune tentative depuis 15 minutes → on repart de zéro ;
 * - blocage en cours → rien ne change, la tentative est refusée ;
 * - sinon un essai de plus ; au-delà de 3 essais en cours, blocage immédiat.
 */
export function nextGuardState(current: LoginGuardState | null, now: Date): LoginGuardState {
  const lockOver = current?.lockedUntil != null && current.lockedUntil <= now;
  const stale =
    current?.lockedUntil === null && current.updatedAt.getTime() <= now.getTime() - LOGIN_WINDOW_MS;
  const base = !current || lockOver || stale ? { attempts: 0, lockedUntil: null } : current;
  if (base.lockedUntil && base.lockedUntil > now) return { ...base, updatedAt: now };
  const attempts = base.attempts + 1;
  return {
    attempts,
    lockedUntil: attempts > MAX_LOGIN_ATTEMPTS ? new Date(now.getTime() + LOGIN_LOCK_MS) : null,
    updatedAt: now,
  };
}

/** L'essai réservé peut-il vérifier le mot de passe ? */
export function isLocked(state: LoginGuardState, now: Date): boolean {
  return state.lockedUntil !== null && state.lockedUntil > now;
}
