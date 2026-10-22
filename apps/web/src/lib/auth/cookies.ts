/**
 * Cookies d'identité du site (S4-T05, ADR-0019). Tous `HttpOnly` (illisibles par JavaScript),
 * `SameSite=Lax`, et `Secure` + préfixe `__Host-` en production (servis seulement en HTTPS,
 * jamais pour un sous-domaine).
 *
 * - session : jeton de session de l'API (30 jours glissants : prolongé à chaque visite par `proxy.ts`) ;
 * - tickets : inscription (24 h) et mot de passe oublié (1 h), le temps de saisir le code ;
 * - appareil (S7.5-T04, ADR-0051) : identifiant aléatoire de ce navigateur, 1 an renouvelé à chaque connexion, pour
 *   n'envoyer l'avis « nouvel appareil » qu'à la première connexion depuis un navigateur.
 *
 * Fichier sans `server-only` : il est aussi lu par `proxy.ts`.
 */
import { SESSION_TTL_DAYS } from "@kemdia/contracts/constants";

const secure = process.env.NODE_ENV === "production";
const prefix = secure ? "__Host-" : "";

export const SESSION_COOKIE = `${prefix}kemdia_session`;
export const SIGNUP_TICKET_COOKIE = `${prefix}kemdia_inscription`;
export const RESET_TICKET_COOKIE = `${prefix}kemdia_mdp_oublie`;
export const DEVICE_COOKIE = `${prefix}kemdia_appareil`;

export const SESSION_MAX_AGE_S = SESSION_TTL_DAYS * 24 * 60 * 60;
export const SIGNUP_TICKET_MAX_AGE_S = 24 * 60 * 60;
export const RESET_TICKET_MAX_AGE_S = 60 * 60;
export const DEVICE_MAX_AGE_S = 365 * 24 * 60 * 60;

export function cookieOptions(maxAge: number) {
  return { httpOnly: true, secure, sameSite: "lax", path: "/", maxAge } as const;
}

/** Effacement : mêmes attributs que la pose (un cookie `__Host-` ne s'efface que par un `Set-Cookie` `Secure`). */
export function expiredCookieOptions() {
  return cookieOptions(0);
}
