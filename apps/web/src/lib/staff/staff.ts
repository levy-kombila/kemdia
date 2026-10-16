import "server-only";
import type { SecondFactorStatus } from "@kemdia/contracts";
import type { Role } from "@kemdia/contracts/constants";
import { cookies, headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { SESSION_COOKIE } from "@/lib/auth/cookies";
import { forgetSession, getCurrentAccount } from "@/lib/auth/session";
import type { AccountSummary } from "@/lib/auth/types";
import { catalogSource } from "@/lib/config/server-config";
import { UNKNOWN_VISITOR, clientIpHeaderName, visitorIp } from "@/lib/security/client-ip";
import { createStaffApi, type StaffApi, type StaffResult } from "./api-staff";
import { confirmedUntil, isAdmin, isStaff, staffPath } from "./roles";

let instance: StaffApi | undefined;

/** Même API et même clé que le catalogue (ADR-0011). */
export function staffApi(): StaffApi {
  instance ??= createStaffApi({
    ...catalogSource(),
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

export type StaffMember = { account: AccountSummary; token: string };

const loginFor = (path: string) => `/connexion?retour=${encodeURIComponent(staffPath(path))}`;

/**
 * Membre de l'équipe connecté (modérateur ou administrateur), SANS exiger la double authentification : pour la page
 * de sécurité (activer la 2FA) et la page de confirmation. Personne d'autre ne voit qu'un espace existe ici (404).
 */
export async function requireTeamMember(
  path: string,
  role: Role = "moderator",
): Promise<StaffMember> {
  const current = await getCurrentAccount();
  if (current.status !== "signed-in") redirect(loginFor(path));
  const allowed =
    role === "admin" ? isAdmin(current.account.roles) : isStaff(current.account.roles);
  if (!allowed) notFound();
  const token = await sessionToken();
  if (!token) redirect(loginFor(path));
  return { account: current.account, token };
}

/**
 * État de la double authentification du membre. Session refusée par l'API → la session est OUBLIÉE de la mémoire de
 * 10 s du site avant d'aller à la connexion (sinon la page de connexion, qui la croirait encore ouverte, renverrait
 * ici : boucle — relecture S6-T05) ; rôle retiré entre-temps → 404. Le reste (API en panne) est rendu à l'appelant.
 */
export async function readSecondFactor(
  member: StaffMember,
  path: string,
): Promise<StaffResult<SecondFactorStatus>> {
  const status = await staffApi().secondFactor(member.token);
  if (!status.ok && status.code === "SESSION_INVALIDE") {
    forgetSession(member.token);
    redirect(loginFor(path));
  }
  if (!status.ok && status.code === "ACCES_REFUSE") notFound();
  return status;
}

export type VerifiedStaff = StaffMember & { factor: SecondFactorStatus };

/**
 * Garde des pages de travail de l'équipe (S6-T05, ADR-0036). L'API reste juge de chaque accès (rôle + 2FA confirmée
 * depuis moins de 15 minutes, ADR-0034) ; cette garde évite seulement d'afficher une page vide :
 *
 * - pas connecté → connexion, puis retour ici ;
 * - ni modérateur ni administrateur (ou pas administrateur pour une page qui l'exige) → 404 ;
 * - double authentification pas encore activée → page « Sécurité » ;
 * - session pas confirmée (ou depuis plus de 15 minutes) → saisie du code, puis retour ici.
 */
export async function requireVerifiedStaff(
  path: string,
  role: Role = "moderator",
  now: Date = new Date(),
): Promise<VerifiedStaff> {
  const member = await requireTeamMember(path, role);
  const status = await readSecondFactor(member, path);
  if (!status.ok) throw new Error("Double authentification momentanément illisible");
  const factor = status.data;
  if (!factor.enabled) redirect("/equipe/securite");
  if (!confirmedUntil(factor, now.getTime())) {
    redirect(`/equipe/confirmer?retour=${encodeURIComponent(staffPath(path))}`);
  }
  return { ...member, factor };
}
