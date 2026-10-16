import "server-only";
import type { Shop } from "@kemdia/contracts";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { SESSION_COOKIE } from "@/lib/auth/cookies";
import { forgetSession, getCurrentAccount } from "@/lib/auth/session";
import type { AccountSummary } from "@/lib/auth/types";
import { catalogSource } from "@/lib/config/server-config";
import { UNKNOWN_VISITOR, clientIpHeaderName, visitorIp } from "@/lib/security/client-ip";
import { createVendorApi, type VendorApi } from "./api-vendor";
import { vendorPath } from "./paths";

let instance: VendorApi | undefined;

/** Même API et même clé que le catalogue (ADR-0011). */
export function vendorApi(): VendorApi {
  instance ??= createVendorApi({
    ...catalogSource(),
    // Envoi d'une photo : l'API en réencode 2 à la fois, 15 s au plus chacune ; une photo en attente peut dépasser 20 s
    uploadTimeoutMs: 35_000,
    visitorIp: async () => {
      const name = clientIpHeaderName();
      if (!name) return null;
      return visitorIp(await headers(), name) ?? UNKNOWN_VISITOR;
    },
  });
  return instance;
}

/** Jeton de session du navigateur (cookie `HttpOnly`) : il ne quitte jamais le serveur du site. */
export async function sessionToken(): Promise<string | null> {
  return (await cookies()).get(SESSION_COOKIE)?.value ?? null;
}

export type VendorMember = { account: AccountSummary; token: string };

const loginFor = (path: string) => `/connexion?retour=${encodeURIComponent(vendorPath(path))}`;

/** Compte connecté (tout compte peut demander une boutique) ; sinon connexion, puis retour ici. */
export async function requireAccount(path: string): Promise<VendorMember> {
  const current = await getCurrentAccount();
  if (current.status !== "signed-in") redirect(loginFor(path));
  const token = await sessionToken();
  if (!token) redirect(loginFor(path));
  return { account: current.account, token };
}

/**
 * Boutique du compte, ou `null` s'il n'en a pas encore. Session refusée par l'API → oubliée de la mémoire de 10 s du
 * site, puis connexion (pas de boucle, relecture S6-T05). API en panne → erreur (page d'erreur du site).
 */
export async function readShop(member: VendorMember, path: string): Promise<Shop | null> {
  const result = await vendorApi().shop(member.token);
  if (result.ok) return result.data;
  if (result.code === "BOUTIQUE_INTROUVABLE") return null;
  if (result.code === "SESSION_INVALIDE") {
    forgetSession(member.token);
    redirect(loginFor(path));
  }
  throw new Error("Boutique momentanément illisible");
}

export type ActiveVendor = VendorMember & { shop: Shop };

/**
 * Garde des pages de produits (S6-T06, ADR-0037) : connecté, avec une boutique ACTIVE ; sinon l'accueil de l'espace
 * vendeur, qui explique où en est la demande. L'API reste juge (rôle vendeur + boutique active à chaque appel).
 */
export async function requireActiveVendor(path: string): Promise<ActiveVendor> {
  const member = await requireAccount(path);
  const shop = await readShop(member, path);
  if (!shop || shop.status !== "active") redirect("/vendeur");
  return { ...member, shop };
}
