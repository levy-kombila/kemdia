import type { IdentityErrorCode, Role } from "@kemdia/contracts/constants";

/**
 * Résultats renvoyés aux formulaires par les actions serveur (S4-T05). Aucune donnée secrète :
 * ni jeton de session, ni ticket (ils restent dans des cookies `HttpOnly`).
 *
 * `INDISPONIBLE` : l'API ne répond pas ou répond autre chose que prévu (le détail est dans les journaux du site).
 */
export type AuthErrorCode = IdentityErrorCode | "INDISPONIBLE";

export type AuthFailure = { ok: false; code: AuthErrorCode; retryAfterSeconds?: number };
export type AuthResult<T extends object = object> = ({ ok: true } & T) | AuthFailure;

/** Code envoyé : destination masquée par l'API, délai avant un nouvel envoi. */
export type CodeSent = { channel: "email" | "sms"; sentTo: string; resendInSeconds: number };

export type SignupInput = {
  firstName: string;
  lastName: string;
  identifier: string;
  password: string;
  acceptTerms: boolean;
  /** « J'ai 18 ans ou plus » (S7-T08, loi 001/2011 modifiée art. 74) */
  adult: boolean;
};

/** Ce que le navigateur reçoit du compte connecté (jamais l'identifiant interne ni le jeton). */
export type AccountSummary = {
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  /** Rôles cumulables (S4-T06) : toujours « client », puis vendeur, modérateur, administrateur */
  roles: readonly Role[];
  /** Version de la photo de profil (S7.5-T08) ; `null` : initiales */
  avatar: string | null;
};
