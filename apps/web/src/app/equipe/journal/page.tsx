import { AUDIT_CURSOR_PATTERN } from "@kemdia/contracts";
import { AUDIT_ACTIONS, type AuditAction } from "@kemdia/contracts/constants";
import { Filter, ScrollText } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { StaffShell } from "@/components/staff/StaffShell";
import { FormAlert } from "@/components/ui/Field";
import { formatDateTime } from "@/lib/format";
import { first } from "@/lib/search-params";
import { AUDIT_ACTION_LABELS, AUDIT_TARGET_LABELS } from "@/lib/staff/audit-labels";
import { staffErrorMessage } from "@/lib/staff/messages";
import { requireVerifiedStaff, staffApi } from "@/lib/staff/staff";

export const metadata: Metadata = { title: "Journal" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const short = (id: string) => id.slice(0, 8);
/** Actions triées par libellé, pour la liste du filtre. */
const OPTIONS = [...AUDIT_ACTIONS].sort((a, b) =>
  AUDIT_ACTION_LABELS[a].localeCompare(AUDIT_ACTION_LABELS[b], "fr"),
);

/**
 * Journal d'audit (S7.5-T05, ADR-0052), administrateurs, LECTURE SEULE : le plus récent d'abord, 50 par page, filtre
 * par action et par compte (qui agit, ou sur qui). Tout ce qui est affiché est du texte (jamais interprété).
 */
export default async function AuditPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const action: AuditAction | undefined = AUDIT_ACTIONS.find((a) => a === first(params.action));
  const rawAccount = first(params.compte)?.toLowerCase();
  const accountId = rawAccount && UUID.test(rawAccount) ? rawAccount : undefined;
  const cursor = first(params.avant);
  const before = cursor && AUDIT_CURSOR_PATTERN.test(cursor) ? cursor : undefined;
  const { account, token } = await requireVerifiedStaff("/equipe/journal", "admin");
  const result = await staffApi().audit(token, { action, accountId, before });
  const filters = (extra: Record<string, string>) => {
    const query = new URLSearchParams();
    if (action) query.set("action", action);
    if (accountId) query.set("compte", accountId);
    for (const [k, v] of Object.entries(extra)) query.set(k, v);
    return `/equipe/journal?${query.toString()}`;
  };

  return (
    <StaffShell
      section="journal"
      roles={account.roles}
      title="Journal"
      crumbs={[{ label: "Journal" }]}
    >
      <form
        action="/equipe/journal"
        className="flex flex-col gap-2 rounded-xl bg-white p-4 sm:flex-row sm:items-end"
      >
        <label className="block min-w-0 flex-1">
          <span className="text-ink-800 mb-1 block text-xs font-semibold">Action</span>
          <select
            name="action"
            defaultValue={action ?? ""}
            className="border-ink-200 h-10 w-full rounded-xl border bg-white px-3"
          >
            <option value="">Toutes les actions</option>
            {OPTIONS.map((a) => (
              <option key={a} value={a}>
                {AUDIT_ACTION_LABELS[a]}
              </option>
            ))}
          </select>
        </label>
        <label className="block min-w-0 flex-1">
          <span className="text-ink-800 mb-1 block text-xs font-semibold">
            Compte (identifiant complet, facultatif)
          </span>
          <input
            name="compte"
            defaultValue={accountId ?? ""}
            maxLength={36}
            autoComplete="off"
            className="border-ink-200 h-10 w-full rounded-xl border bg-white px-3 font-mono text-sm"
          />
        </label>
        <button
          type="submit"
          className="bg-ink-900 flex h-10 items-center justify-center gap-2 rounded-full px-5 font-semibold text-white"
        >
          <Filter className="size-4" aria-hidden /> Filtrer
        </button>
      </form>

      {!result.ok ? (
        <FormAlert>{staffErrorMessage(result.code)}</FormAlert>
      ) : result.data.items.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-xl bg-white px-6 py-12 text-center">
          <ScrollText className="text-ink-400 size-10" aria-hidden />
          <p className="font-semibold">Aucune ligne.</p>
        </div>
      ) : (
        <>
          <ol className="space-y-2">
            {result.data.items.map((event) => (
              <li key={event.id} className="space-y-1 rounded-xl bg-white p-4 text-sm">
                <p className="flex flex-wrap items-baseline gap-x-2">
                  <span className="font-bold">{AUDIT_ACTION_LABELS[event.action]}</span>
                  <span className="text-ink-500">{formatDateTime(event.occurredAt)}</span>
                </p>
                <p className="text-ink-700">
                  Par{" "}
                  {event.actor.type === "system" ? (
                    "le serveur"
                  ) : (
                    <Link
                      href={`/equipe/journal?compte=${event.actor.id}`}
                      className="text-brand-700 font-mono underline"
                      title={event.actor.id}
                    >
                      compte {short(event.actor.id)}
                    </Link>
                  )}
                  {event.target && (
                    <>
                      {" "}
                      · sur {AUDIT_TARGET_LABELS[event.target.type]}{" "}
                      {event.target.type === "account" ? (
                        <Link
                          href={`/equipe/journal?compte=${event.target.id}`}
                          className="text-brand-700 font-mono underline"
                          title={event.target.id}
                        >
                          {short(event.target.id)}
                        </Link>
                      ) : (
                        <span className="font-mono" title={event.target.id}>
                          {short(event.target.id)}
                        </span>
                      )}
                    </>
                  )}
                  {event.ip && <span className="text-ink-500"> · {event.ip}</span>}
                </p>
                {Object.keys(event.details).length > 0 && (
                  <dl className="text-ink-500 flex flex-wrap gap-x-4">
                    {Object.entries(event.details).map(([key, value]) => (
                      <div key={key} className="flex gap-1">
                        <dt>{key} :</dt>
                        <dd className="text-ink-800 break-all">{String(value)}</dd>
                      </div>
                    ))}
                  </dl>
                )}
              </li>
            ))}
          </ol>
          {result.data.nextCursor && (
            <Link
              href={filters({ avant: result.data.nextCursor })}
              className="border-ink-200 hover:bg-ink-50 inline-flex rounded-full border-2 bg-white px-5 py-2.5 text-sm font-semibold"
            >
              Lignes plus anciennes
            </Link>
          )}
        </>
      )}
    </StaffShell>
  );
}
