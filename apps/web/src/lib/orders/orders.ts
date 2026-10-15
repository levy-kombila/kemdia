import "server-only";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { getCurrentAccount } from "@/lib/auth/session";
import type { AccountSummary } from "@/lib/auth/types";
import { SESSION_COOKIE } from "@/lib/auth/cookies";
import { catalogSource } from "@/lib/config/server-config";
import { UNKNOWN_VISITOR, clientIpHeaderName, visitorIp } from "@/lib/security/client-ip";
import { createOrdersApi, type OrdersApi } from "./api-orders";

let instance: OrdersApi | undefined;

/** Même API et même clé que le catalogue (ADR-0011). */
export function ordersApi(): OrdersApi {
  instance ??= createOrdersApi({
    ...catalogSource(),
    visitorIp: async () => {
      const name = clientIpHeaderName();
      if (!name) return null;
      return visitorIp(await headers(), name) ?? UNKNOWN_VISITOR;
    },
  });
  return instance;
}

/** Jeton de session (cookie `HttpOnly`), jamais transmis au navigateur. */
export async function sessionToken(): Promise<string | null> {
  return (await cookies()).get(SESSION_COOKIE)?.value ?? null;
}

/**
 * Compte connecté obligatoire (choix du 2026-10-10) : sans session valable, retour à la connexion, puis à `returnTo`
 * (chemin du site, revérifié par la page de connexion). Si l'API ne répond pas, la session ne peut pas être
 * vérifiée : même retour à la connexion, sans effacer le cookie (une panne ne déconnecte personne).
 */
export async function requireAccount(returnTo: string): Promise<AccountSummary> {
  const current = await getCurrentAccount();
  if (current.status !== "signed-in") redirect(`/connexion?retour=${encodeURIComponent(returnTo)}`);
  return current.account;
}
