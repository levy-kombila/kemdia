import type { IdentityErrorCode } from "@kemdia/contracts/constants";

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
};

/** Ce que le navigateur reçoit du compte connecté (jamais l'identifiant interne ni le jeton). */
export type AccountSummary = {
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
};
