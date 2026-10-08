"use server";

import { OTP_CODE_PATTERN, SIGNUP_TICKET_PATTERN } from "@kemdia/contracts/constants";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import {
  RESET_TICKET_COOKIE,
  RESET_TICKET_MAX_AGE_S,
  SESSION_COOKIE,
  SESSION_MAX_AGE_S,
  SIGNUP_TICKET_COOKIE,
  SIGNUP_TICKET_MAX_AGE_S,
  cookieOptions,
  expiredCookieOptions,
} from "./cookies";
import { forgetAllSessions, forgetSession, identityApi, toSummary } from "./session";
import type { AccountSummary, AuthFailure, AuthResult, CodeSent, SignupInput } from "./types";

/**
 * Actions serveur de l'identité (S4-T05, ADR-0019). Ce sont des points d'entrée publics :
 * chaque argument est revérifié ici (type, longueur) ; l'API refait toutes les règles métier.
 * Next.js refuse une action venant d'une autre origine (en-tête `Origin` comparé à l'hôte).
 *
 * Le jeton de session et les tickets ne quittent jamais le serveur : ils vont dans des cookies `HttpOnly`.
 */

const text = (value: unknown, max: number): string | null =>
  typeof value === "string" && value.length <= max ? value : null;

const invalid = (code: AuthFailure["code"]): AuthFailure => ({ ok: false, code });

async function userAgent(): Promise<string | null> {
  return (await headers()).get("user-agent");
}

async function clearCookie(name: string): Promise<void> {
  (await cookies()).set(name, "", expiredCookieOptions());
}

/** Pose le cookie de session ; une session précédente sur ce navigateur est fermée côté API. */
async function openSession(token: string): Promise<void> {
  const store = await cookies();
  const previous = store.get(SESSION_COOKIE)?.value;
  if (previous && previous !== token) {
    await identityApi().logout(previous);
    forgetSession(previous);
  }
  store.set(SESSION_COOKIE, token, cookieOptions(SESSION_MAX_AGE_S));
}

function sent(data: CodeSent): CodeSent {
  return { channel: data.channel, sentTo: data.sentTo, resendInSeconds: data.resendInSeconds };
}

/** Tickets d'inscription et de mot de passe oublié : même format (32 octets en base64url). */
const TICKET_PATTERN = SIGNUP_TICKET_PATTERN;

async function ticketFrom(cookie: string): Promise<string | null> {
  const value = (await cookies()).get(cookie)?.value;
  return value && TICKET_PATTERN.test(value) ? value : null;
}

// --- Connexion ---

export async function loginAction(
  identifier: unknown,
  password: unknown,
): Promise<AuthResult<{ account: AccountSummary }>> {
  const id = text(identifier, 300);
  const pw = text(password, 200);
  if (!id || !pw) return invalid("IDENTIFIANTS_INCORRECTS");
  const result = await identityApi().login(id, pw, await userAgent());
  if (!result.ok) return result;
  await openSession(result.data.token);
  return { ok: true, account: toSummary(result.data.account) };
}

/** Déconnexion de cet appareil : le cookie est effacé même si l'API ne répond pas. */
export async function logoutAction(): Promise<never> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (token) {
    await identityApi().logout(token);
    // Après l'appel : une page lue pendant la déconnexion ne garde pas « connecté » en mémoire
    forgetSession(token);
  }
  await clearCookie(SESSION_COOKIE);
  redirect("/");
}

/** « Déconnecter tous mes appareils » (celui-ci compris). */
export async function logoutAllAction(): Promise<never> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (!token) redirect("/connexion?retour=/compte");
  const result = await identityApi().logoutAll(token);
  if (!result.ok && result.code !== "SESSION_INVALIDE") redirect("/compte?erreur=indisponible");
  forgetAllSessions();
  await clearCookie(SESSION_COOKIE);
  redirect("/connexion?deconnecte=tous");
}

/** Efface un cookie de session que l'API refuse (session expirée ou fermée ailleurs). */
export async function clearStaleSessionAction(): Promise<void> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (!token) return;
  // Vérification fraîche (sans la mémoire de 10 s) avant d'effacer quoi que ce soit
  const result = await identityApi().session(token);
  if (!result.ok && result.code === "SESSION_INVALIDE") {
    forgetSession(token);
    await clearCookie(SESSION_COOKIE);
  }
}

// --- Inscription ---

export async function signupAction(input: unknown): Promise<AuthResult<CodeSent>> {
  const data = (typeof input === "object" && input !== null ? input : {}) as Partial<
    Record<keyof SignupInput, unknown>
  >;
  const firstName = text(data.firstName, 100);
  const lastName = text(data.lastName, 100);
  const identifier = text(data.identifier, 300);
  const password = text(data.password, 200);
  if (firstName === null || lastName === null) return invalid("NOM_INVALIDE");
  if (identifier === null) return invalid("IDENTIFIANT_INVALIDE");
  if (password === null) return invalid("MOT_DE_PASSE_FAIBLE");
  if (data.acceptTerms !== true) return invalid("INDISPONIBLE");

  const result = await identityApi().signup({
    firstName,
    lastName,
    identifier,
    password,
    acceptTerms: true,
  });
  if (!result.ok) return result;
  (await cookies()).set(
    SIGNUP_TICKET_COOKIE,
    result.data.ticket,
    cookieOptions(SIGNUP_TICKET_MAX_AGE_S),
  );
  return { ok: true, ...sent(result.data) };
}

export async function verifySignupAction(
  code: unknown,
): Promise<AuthResult<{ account: AccountSummary }>> {
  const value = text(code, 6);
  if (!value || !OTP_CODE_PATTERN.test(value)) return invalid("CODE_INVALIDE");
  const ticket = await ticketFrom(SIGNUP_TICKET_COOKIE);
  if (!ticket) return invalid("CODE_EXPIRE");
  const result = await identityApi().verifySignup(ticket, value, await userAgent());
  if (!result.ok) return result;
  await clearCookie(SIGNUP_TICKET_COOKIE);
  await openSession(result.data.token);
  return { ok: true, account: toSummary(result.data.account) };
}

export async function resendSignupAction(): Promise<AuthResult<CodeSent>> {
  const ticket = await ticketFrom(SIGNUP_TICKET_COOKIE);
  if (!ticket) return invalid("CODE_EXPIRE");
  const result = await identityApi().resendSignup(ticket);
  return result.ok ? { ok: true, ...sent(result.data) } : result;
}

// --- Mot de passe oublié ---

export async function forgotPasswordAction(identifier: unknown): Promise<AuthResult<CodeSent>> {
  const id = text(identifier, 300);
  if (!id) return invalid("IDENTIFIANT_INVALIDE");
  const result = await identityApi().forgotPassword(id);
  if (!result.ok) return result;
  (await cookies()).set(
    RESET_TICKET_COOKIE,
    result.data.ticket,
    cookieOptions(RESET_TICKET_MAX_AGE_S),
  );
  return { ok: true, ...sent(result.data) };
}

export async function resendResetAction(): Promise<AuthResult<CodeSent>> {
  const ticket = await ticketFrom(RESET_TICKET_COOKIE);
  if (!ticket) return invalid("CODE_EXPIRE");
  const result = await identityApi().resendReset(ticket);
  return result.ok ? { ok: true, ...sent(result.data) } : result;
}

export async function resetPasswordAction(
  code: unknown,
  newPassword: unknown,
): Promise<AuthResult<{ account: AccountSummary }>> {
  const value = text(code, 6);
  const password = text(newPassword, 200);
  if (!value || !OTP_CODE_PATTERN.test(value)) return invalid("CODE_INVALIDE");
  if (password === null) return invalid("MOT_DE_PASSE_FAIBLE");
  const ticket = await ticketFrom(RESET_TICKET_COOKIE);
  if (!ticket) return invalid("CODE_EXPIRE");
  const result = await identityApi().resetPassword(ticket, value, password, await userAgent());
  if (!result.ok) return result;
  await clearCookie(RESET_TICKET_COOKIE);
  forgetAllSessions();
  await openSession(result.data.token);
  return { ok: true, account: toSummary(result.data.account) };
}
