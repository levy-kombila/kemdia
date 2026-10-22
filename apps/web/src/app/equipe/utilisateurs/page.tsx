import { STAFF_CURSOR_PATTERN } from "@kemdia/contracts";
import { ROLE_LABELS, STAFF_ROLES, type StaffRole } from "@kemdia/contracts/constants";
import { ShieldCheck, ShieldOff, Users } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { StaffAccountLookup } from "@/components/staff/AccountLookupForms";
import { StaffShell, StatusBadge } from "@/components/staff/StaffShell";
import {
  DisableAccountForm,
  EnableAccountForm,
  RemoveStaffForm,
  RoleToggles,
} from "@/components/staff/StaffAccountForms";
import { FormAlert } from "@/components/ui/Field";
import { cn } from "@/lib/cn";
import { formatDateTime } from "@/lib/format";
import { first } from "@/lib/search-params";
import { staffErrorFromParam, staffErrorMessage, staffNotice } from "@/lib/staff/messages";
import { requireVerifiedStaff, staffApi } from "@/lib/staff/staff";

export const metadata: Metadata = { title: "Utilisateurs" };

const PAGE_SIZE = 50;

/**
 * Écran Utilisateurs (S7.5-T04, ADR-0051), administrateurs seulement : l'équipe par nom, ses rôles et sa double
 * authentification ; ajouter quelqu'un (recherche), accorder ou retirer un rôle, retirer tous ses rôles (départ),
 * désactiver ou réactiver le compte. Un administrateur n'est jamais modifiable ici (commande serveur seulement).
 */
export default async function StaffUsersPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const role: StaffRole | undefined = STAFF_ROLES.find((r) => r === first(params.role));
  const raw = first(params.apres);
  const after = raw && STAFF_CURSOR_PATTERN.test(raw) ? raw : undefined;
  const { account, token } = await requireVerifiedStaff(
    role ? `/equipe/utilisateurs?role=${role}` : "/equipe/utilisateurs",
    "admin",
  );
  const result = await staffApi().staff(token, { role, after, limit: PAGE_SIZE });
  const tabs: { id: StaffRole | undefined; label: string }[] = [
    { id: undefined, label: "Toute l'équipe" },
    ...STAFF_ROLES.map((id) => ({ id, label: ROLE_LABELS[id] })),
  ];

  return (
    <StaffShell
      section="utilisateurs"
      roles={account.roles}
      title="Utilisateurs"
      crumbs={[{ label: "Utilisateurs" }]}
      notice={staffNotice(first(params.ok))}
      error={staffErrorFromParam(first(params.erreur))}
    >
      <section className="space-y-2">
        <h2 className="text-lg font-bold">Ajouter quelqu&apos;un à l&apos;équipe</h2>
        <p className="text-ink-500 text-sm">
          La personne doit déjà avoir un compte client. Elle devra activer la double
          authentification avant d&apos;utiliser son rôle.
        </p>
        <StaffAccountLookup />
      </section>

      <nav aria-label="Rôle" className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
        <ul className="flex gap-2">
          {tabs.map((tab) => (
            <li key={tab.id ?? "tous"} className="shrink-0">
              <Link
                href={tab.id ? `/equipe/utilisateurs?role=${tab.id}` : "/equipe/utilisateurs"}
                aria-current={tab.id === role ? "page" : undefined}
                className={cn(
                  "inline-flex rounded-full border-2 px-4 py-1.5 text-sm font-semibold",
                  tab.id === role
                    ? "border-ink-900 bg-ink-900 text-white"
                    : "border-ink-200 hover:bg-ink-50 bg-white",
                )}
              >
                {tab.label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>

      {!result.ok ? (
        <FormAlert>{staffErrorMessage(result.code)}</FormAlert>
      ) : result.data.items.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-xl bg-white px-6 py-12 text-center">
          <Users className="text-ink-400 size-10" aria-hidden />
          <p className="font-semibold">{after ? "Pas d'autre membre." : "Personne ici."}</p>
        </div>
      ) : (
        <>
          <ul className="space-y-3">
            {result.data.items.map((member) => {
              // Affichage seulement : l'API refuse de toute façon d'agir sur soi-même ou sur un administrateur
              const self =
                (member.email !== null && member.email === account.email) ||
                (member.phone !== null && member.phone === account.phone);
              const protectedAccount = member.roles.includes("admin") || self;
              return (
                <li key={member.id} className="space-y-3 rounded-xl bg-white p-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-bold">
                      {member.firstName} {member.lastName}
                    </span>
                    {member.status === "disabled" && (
                      <StatusBadge tone="off">Désactivé</StatusBadge>
                    )}
                    {member.secondFactorEnabled ? (
                      <StatusBadge tone="ok">
                        <ShieldCheck className="size-3.5" aria-hidden /> Double authentification
                      </StatusBadge>
                    ) : (
                      <StatusBadge tone="wait">
                        <ShieldOff className="size-3.5" aria-hidden /> Double authentification à
                        activer
                      </StatusBadge>
                    )}
                  </div>
                  <p className="text-ink-500 text-sm">
                    {[member.email, member.phone].filter(Boolean).join(" · ")} · dernière visite le{" "}
                    {formatDateTime(member.lastActiveAt)}
                  </p>
                  {protectedAccount ? (
                    <p className="text-ink-700 text-sm">
                      {member.roles.includes("admin")
                        ? "Administrateur : géré depuis le serveur seulement."
                        : "C'est vous : vos rôles ne se changent pas ici."}
                    </p>
                  ) : (
                    <>
                      <RoleToggles accountId={member.id} roles={member.roles} />
                      <div className="flex flex-wrap items-start gap-2">
                        <RemoveStaffForm accountId={member.id} />
                        {member.status === "disabled" ? (
                          <EnableAccountForm accountId={member.id} />
                        ) : (
                          <DisableAccountForm accountId={member.id} />
                        )}
                      </div>
                    </>
                  )}
                </li>
              );
            })}
          </ul>
          {result.data.nextCursor && (
            <Link
              href={`/equipe/utilisateurs?${role ? `role=${role}&` : ""}apres=${result.data.nextCursor}`}
              className="border-ink-200 hover:bg-ink-50 inline-flex rounded-full border-2 bg-white px-5 py-2.5 text-sm font-semibold"
            >
              Membres suivants
            </Link>
          )}
        </>
      )}
    </StaffShell>
  );
}
