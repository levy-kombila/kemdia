"use client";

import type { AdminAccount, SupportAccount } from "@kemdia/contracts";
import { ROLE_LABELS } from "@kemdia/contracts/constants";
import { ChevronRight, LoaderCircle, Search } from "lucide-react";
import Link from "next/link";
import { useActionState } from "react";
import { FormAlert } from "@/components/ui/Field";
import {
  lookupStaffAccountAction,
  supportLookupAction,
  type LookupResult,
} from "@/lib/staff/actions";
import { DisableAccountForm, EnableAccountForm, RoleToggles } from "./StaffAccountForms";

/**
 * Recherches par e-mail ou téléphone (S7.5-T04). Envoyées dans le corps d'une action serveur : l'identifiant n'est
 * jamais mis dans une adresse (historique, journaux), et le résultat n'est rendu qu'au navigateur qui l'a demandé.
 */
function LookupField({ pending, label }: { pending: boolean; label: string }) {
  return (
    <div className="flex flex-col gap-2 sm:flex-row">
      <label className="min-w-0 flex-1">
        <span className="sr-only">{label}</span>
        <input
          name="identifier"
          required
          maxLength={300}
          autoComplete="off"
          placeholder="E-mail ou téléphone (07 12 34 56)"
          className="border-ink-200 focus:border-brand-600 focus:ring-brand-100 h-11 w-full rounded-xl border bg-white px-4 outline-none focus:ring-4"
        />
      </label>
      <button
        type="submit"
        disabled={pending}
        aria-busy={pending}
        className="bg-ink-900 flex h-11 items-center justify-center gap-2 rounded-full px-5 font-semibold text-white disabled:opacity-70"
      >
        {pending ? (
          <LoaderCircle className="size-4 animate-spin" aria-hidden />
        ) : (
          <Search className="size-4" aria-hidden />
        )}
        Rechercher
      </button>
    </div>
  );
}

const STATUS_LABELS: Record<AdminAccount["status"], string> = {
  pending: "inscription non terminée",
  active: "actif",
  disabled: "désactivé",
};

function Identity({ account }: { account: AdminAccount }) {
  return (
    <div>
      <p className="font-bold">
        {account.firstName} {account.lastName}
      </p>
      <p className="text-ink-500 text-sm">
        {[account.email, account.phone].filter(Boolean).join(" · ")} · compte{" "}
        {STATUS_LABELS[account.status]} ·{" "}
        {account.roles.map((role) => ROLE_LABELS[role]).join(", ")}
      </p>
    </div>
  );
}

/** Administrateurs : retrouver un compte pour lui donner (ou retirer) un rôle de l'équipe. */
export function StaffAccountLookup() {
  const [state, action, pending] = useActionState<LookupResult<AdminAccount>, FormData>(
    lookupStaffAccountAction,
    null,
  );
  return (
    <div className="space-y-3">
      <form action={action}>
        <LookupField pending={pending} label="Compte à ajouter à l'équipe" />
      </form>
      {state && !state.ok && <FormAlert>{state.message}</FormAlert>}
      {state?.ok && (
        <div className="space-y-3 rounded-xl bg-white p-4">
          <Identity account={state.account} />
          {state.account.roles.includes("admin") ? (
            <p className="text-ink-500 text-sm">
              Administrateur : ses rôles ne se gèrent que depuis le serveur.
            </p>
          ) : (
            <>
              <RoleToggles accountId={state.account.id} roles={state.account.roles} />
              {state.account.status === "disabled" ? (
                <EnableAccountForm accountId={state.account.id} />
              ) : (
                state.account.status === "active" && (
                  <DisableAccountForm accountId={state.account.id} />
                )
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

/** Service client : retrouver un client, puis voir ses commandes (lecture seule). */
export function SupportAccountLookup() {
  const [state, action, pending] = useActionState<LookupResult<SupportAccount>, FormData>(
    supportLookupAction,
    null,
  );
  return (
    <div className="space-y-3">
      <form action={action}>
        <LookupField pending={pending} label="Client à retrouver" />
      </form>
      {state && !state.ok && <FormAlert>{state.message}</FormAlert>}
      {state?.ok && (
        <Link
          href={`/equipe/clients/${state.account.id}`}
          className="hover:ring-brand-100 flex items-center gap-3 rounded-xl bg-white p-4 transition hover:ring-4"
        >
          <span className="min-w-0 flex-1">
            <Identity account={state.account} />
            <span className="text-ink-500 block text-sm">
              E-mail {state.account.emailVerified ? "vérifié" : "non vérifié"} · téléphone{" "}
              {state.account.phoneVerified ? "vérifié" : "non vérifié"} · voir ses commandes
            </span>
          </span>
          <ChevronRight className="text-ink-400 size-5 shrink-0" aria-hidden />
        </Link>
      )}
    </div>
  );
}
