import "server-only";
import { createHash } from "node:crypto";
import type { CurrentSession } from "@kemdia/contracts";
import { cookies } from "next/headers";
import { cache } from "react";
import { catalogSource } from "@/lib/config/server-config";
import { createIdentityApi, type ApiResult, type IdentityApi } from "./api-identity";
import { SESSION_COOKIE } from "./cookies";
import type { AccountSummary } from "./types";

let instance: IdentityApi | undefined;

/** Même API et même clé que le catalogue (ADR-0011) ; configuration vérifiée au démarrage. */
export function identityApi(): IdentityApi {
  instance ??= createIdentityApi(catalogSource());
  return instance;
}

/**
 * Réponses de l'API gardées 10 s par session, et demandes simultanées regroupées : une page et les
 * liens qu'elle précharge ne font qu'un appel. Les déconnexions faites par ce site oublient aussitôt
 * leur session ; une session fermée depuis un autre appareil disparaît au plus tard 10 s après.
 * Clé : empreinte du jeton (le jeton n'est pas gardé tel quel). Les pannes ne sont pas gardées.
 */
export const SESSION_CACHE_MS = 10_000;
const MAX_CACHED_SESSIONS = 1_000;

type Lookup = (token: string) => Promise<ApiResult<CurrentSession>>;

export function createSessionCache(lookup: Lookup, ttlMs = SESSION_CACHE_MS) {
  const recent = new Map<string, { expires: number; result: Promise<ApiResult<CurrentSession>> }>();
  const keyOf = (token: string) => createHash("sha256").update(token).digest("hex");
  return {
    check(token: string, now = Date.now()): Promise<ApiResult<CurrentSession>> {
      const key = keyOf(token);
      const hit = recent.get(key);
      if (hit && hit.expires > now) return hit.result;
      const result = lookup(token);
      if (recent.size >= MAX_CACHED_SESSIONS) recent.delete(recent.keys().next().value as string);
      recent.set(key, { expires: now + ttlMs, result });
      void result.then((r) => {
        if (!r.ok && r.code === "INDISPONIBLE") recent.delete(key);
      });
      return result;
    },
    forget(token: string): void {
      recent.delete(keyOf(token));
    },
    clear(): void {
      recent.clear();
    },
  };
}

const sessions = createSessionCache((token) => identityApi().session(token));

export const checkSession = (token: string) => sessions.check(token);
/** À appeler quand ce site ferme une session (déconnexion). */
export const forgetSession = (token: string) => sessions.forget(token);
/** Nouveau mot de passe ou « tous mes appareils » : d'autres sessions ferment, on oublie tout (rare). */
export const forgetAllSessions = () => sessions.clear();

export type CurrentAccount =
  /** Personne n'est connecté (pas de cookie, ou API injoignable : on ne touche alors à rien) */
  | { status: "guest" }
  /** Le cookie ne vaut plus rien (session expirée ou fermée ailleurs) : à effacer */
  | { status: "stale" }
  | { status: "signed-in"; account: AccountSummary };

export function toSummary(account: AccountSummary): AccountSummary {
  return {
    firstName: account.firstName,
    lastName: account.lastName,
    email: account.email,
    phone: account.phone,
  };
}

/**
 * Compte connecté, lu UNE fois par requête (`cache` de React) : l'en-tête et la page le partagent.
 * Sans cookie, l'API n'est pas appelée.
 */
export const getCurrentAccount = cache(async (): Promise<CurrentAccount> => {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return { status: "guest" };
  const result = await checkSession(token);
  if (result.ok) return { status: "signed-in", account: toSummary(result.data.account) };
  // Seule une session refusée par l'API efface le cookie ; une panne de l'API ne déconnecte personne
  return result.code === "SESSION_INVALIDE" ? { status: "stale" } : { status: "guest" };
});
