"use server";

import { cookies } from "next/headers";
import { SESSION_COOKIE, expiredCookieOptions } from "@/lib/auth/cookies";
import { forgetAllSessions, forgetSession } from "@/lib/auth/session";
import { identityApi } from "@/lib/auth/session";
import type { PrivacyFailureCode } from "./api-privacy";
import { privacyApi } from "./privacy";

export type DeleteAccountResult =
  { ok: true } | { ok: false; code: PrivacyFailureCode; retryAfterSeconds?: number };

/**
 * « Supprimer mon compte » (S7-T08) : point d'entrée public, arguments revérifiés ici ; l'API refait tout
 * (mot de passe, empêchements, effacement). Réussite : cookie de session effacé, ce navigateur est déconnecté.
 */
export async function deleteAccountAction(
  password: unknown,
  confirm: unknown,
): Promise<DeleteAccountResult> {
  if (typeof password !== "string" || password.length === 0 || password.length > 200) {
    return { ok: false, code: "MOT_DE_PASSE_INCORRECT" };
  }
  // La case « définitif » est exigée ici aussi : jamais de suppression sans elle
  if (confirm !== true) return { ok: false, code: "INDISPONIBLE" };
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (!token) return { ok: false, code: "SESSION_INVALIDE" };

  const result = await privacyApi().deleteAccount(token, password);
  if (result.ok) {
    forgetAllSessions();
    store.set(SESSION_COOKIE, "", expiredCookieOptions());
    return { ok: true };
  }
  // 3e mot de passe faux : l'API a fermé la session ; on ne déconnecte que si elle la refuse vraiment
  const closed =
    result.code === "SESSION_INVALIDE" ||
    (result.code === "COMPTE_BLOQUE" && !(await identityApi().session(token)).ok);
  if (closed) {
    forgetSession(token);
    store.set(SESSION_COOKIE, "", expiredCookieOptions());
    return { ok: false, code: "SESSION_INVALIDE" };
  }
  return result;
}
