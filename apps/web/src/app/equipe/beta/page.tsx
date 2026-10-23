import type { Metadata } from "next";
import Link from "next/link";
import {
  BETA_INVITATION_KINDS,
  BETA_INVITATION_KIND_LABELS,
  type BetaInvitationStatus,
} from "@kemdia/contracts/constants";
import { StaffShell } from "@/components/staff/StaffShell";
import { FormAlert } from "@/components/ui/Field";
import { formatDateTime } from "@/lib/format";
import { first } from "@/lib/search-params";
import {
  inviteToBetaAction,
  revokeBetaInvitationAction,
  setBetaClosedAction,
} from "@/lib/staff/actions";
import { CURSOR } from "@/lib/staff/labels";
import { staffErrorFromParam, staffErrorMessage, staffNotice } from "@/lib/staff/messages";
import { requireVerifiedStaff, staffApi } from "@/lib/staff/staff";

export const metadata: Metadata = { title: "Bêta fermée" };

const inputClass =
  "border-ink-200 focus:border-brand-600 focus:ring-brand-100 w-full rounded-xl border bg-white px-3 py-2 text-sm outline-none focus:ring-4";

const STATUS_LABELS: Record<BetaInvitationStatus, string> = {
  active: "Valable",
  used: "Compte créé",
  expired: "Expirée",
  revoked: "Annulée",
};

/**
 * Bêta fermée (S8-T02, ADR-0057), administrateurs : réserver la création de compte aux adresses invitées, inviter
 * (ou relancer) une adresse, annuler une invitation. Les comptes déjà créés se connectent toujours.
 */
export default async function BetaPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const raw = first(params.apres);
  const after = raw && CURSOR.test(raw) ? raw : undefined;
  const { account, token } = await requireVerifiedStaff("/equipe/beta", "admin");
  const [settings, invitations] = await Promise.all([
    staffApi().betaSettings(token),
    staffApi().betaInvitations(token, { after }),
  ]);

  return (
    <StaffShell
      section="beta"
      roles={account.roles}
      title="Bêta fermée"
      crumbs={[{ label: "Bêta fermée" }]}
      notice={staffNotice(first(params.ok))}
      error={staffErrorFromParam(first(params.erreur))}
    >
      <section className="space-y-3 rounded-xl bg-white p-5">
        <h2 className="font-bold">Création de compte</h2>
        {!settings.ok ? (
          <FormAlert>{staffErrorMessage(settings.code)}</FormAlert>
        ) : (
          <>
            <p className="text-sm">
              {settings.data.closed ? (
                <>
                  <strong>Réservée aux invités.</strong> Une adresse sans invitation valable ne peut
                  pas créer de compte ; les comptes existants se connectent normalement.
                </>
              ) : (
                <>
                  <strong>Ouverte à tous.</strong> Les invitations restent enregistrées et serviront
                  dès que vous réserverez l&apos;inscription aux invités.
                </>
              )}
              {settings.data.updatedAt && (
                <span className="text-ink-500">
                  {" "}
                  (changé le {formatDateTime(settings.data.updatedAt)})
                </span>
              )}
            </p>
            <form action={setBetaClosedAction}>
              <input type="hidden" name="closed" value={settings.data.closed ? "false" : "true"} />
              <button
                type="submit"
                className="bg-brand-600 hover:bg-brand-700 rounded-full px-4 py-2 text-sm font-semibold text-white"
              >
                {settings.data.closed ? "Ouvrir l'inscription à tous" : "Réserver aux invités"}
              </button>
            </form>
          </>
        )}
      </section>

      <section className="space-y-3 rounded-xl bg-white p-5">
        <h2 className="font-bold">Inviter quelqu&apos;un</h2>
        <p className="text-ink-500 text-sm">
          La personne crée son compte avec CETTE adresse (aucun code à recopier). Valable 30 jours ;
          inviter de nouveau la même adresse relance l&apos;invitation.
        </p>
        <form action={inviteToBetaAction} className="flex flex-wrap items-end gap-3">
          <div className="min-w-60 flex-1">
            <label htmlFor="identifier" className="mb-1.5 block text-sm font-semibold">
              Adresse e-mail ou mobile
            </label>
            <input
              id="identifier"
              name="identifier"
              required
              maxLength={254}
              autoComplete="off"
              placeholder="awa@exemple.ga ou 074 12 34 56"
              className={inputClass}
            />
          </div>
          <div>
            <label htmlFor="kind" className="mb-1.5 block text-sm font-semibold">
              Pour
            </label>
            <select id="kind" name="kind" className={inputClass} defaultValue="tester">
              {BETA_INVITATION_KINDS.map((kind) => (
                <option key={kind} value={kind}>
                  {BETA_INVITATION_KIND_LABELS[kind]}
                </option>
              ))}
            </select>
          </div>
          <button
            type="submit"
            className="bg-brand-600 hover:bg-brand-700 rounded-full px-4 py-2 text-sm font-semibold text-white"
          >
            Inviter
          </button>
        </form>
      </section>

      <section className="space-y-3">
        <h2 className="font-bold">Invitations</h2>
        {!invitations.ok ? (
          <FormAlert>{staffErrorMessage(invitations.code)}</FormAlert>
        ) : invitations.data.items.length === 0 ? (
          <p className="text-ink-500 rounded-xl bg-white p-5 text-sm">Aucune invitation.</p>
        ) : (
          <ul className="space-y-2">
            {invitations.data.items.map((i) => (
              <li
                key={i.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-white p-4 text-sm"
              >
                <div>
                  <p className="break-all font-semibold">{i.identifier}</p>
                  <p className="text-ink-500">
                    {BETA_INVITATION_KIND_LABELS[i.kind]} · {STATUS_LABELS[i.status]} ·{" "}
                    {i.status === "used" && i.usedAt
                      ? `compte créé le ${formatDateTime(i.usedAt)}`
                      : `jusqu'au ${formatDateTime(i.expiresAt)}`}
                  </p>
                </div>
                {i.status === "active" && (
                  <form action={revokeBetaInvitationAction}>
                    <input type="hidden" name="invitationId" value={i.id} />
                    <button
                      type="submit"
                      className="border-ink-300 hover:bg-ink-50 rounded-full border px-4 py-2 text-sm font-semibold"
                    >
                      Annuler
                    </button>
                  </form>
                )}
              </li>
            ))}
          </ul>
        )}
        {invitations.ok && invitations.data.nextCursor && (
          <Link
            href={`/equipe/beta?apres=${invitations.data.nextCursor}`}
            className="text-brand-700 text-sm font-semibold underline"
          >
            Invitations suivantes
          </Link>
        )}
      </section>
    </StaffShell>
  );
}
