import type { Metadata } from "next";
import Link from "next/link";
import {
  PROBLEM_CATEGORY_LABELS,
  PROBLEM_STATUSES,
  PROBLEM_STATUS_LABELS,
  type ProblemStatus,
} from "@kemdia/contracts/constants";
import { StaffShell } from "@/components/staff/StaffShell";
import { FormAlert } from "@/components/ui/Field";
import { formatDateTime } from "@/lib/format";
import { first } from "@/lib/search-params";
import { setProblemStatusAction } from "@/lib/staff/actions";
import { CURSOR } from "@/lib/staff/labels";
import { staffErrorFromParam, staffErrorMessage, staffNotice } from "@/lib/staff/messages";
import { requireVerifiedStaff, staffApi } from "@/lib/staff/staff";

export const metadata: Metadata = { title: "Signalements" };

/** Ce que le service client peut faire depuis chaque état. */
const NEXT: Record<ProblemStatus, { to: ProblemStatus; label: string }[]> = {
  new: [
    { to: "in_progress", label: "Prendre en charge" },
    { to: "resolved", label: "Résolu" },
  ],
  in_progress: [{ to: "resolved", label: "Résolu" }],
  resolved: [{ to: "in_progress", label: "Rouvrir" }],
};

/**
 * Problèmes signalés pendant la bêta (S8-T02, ADR-0057), service client : du plus ancien au plus récent, avec de quoi
 * répondre à l'auteur. Le texte vient des clients : affiché par React (échappé), jamais en lien.
 */
export default async function ProblemsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const rawStatus = first(params.etat);
  const status: ProblemStatus =
    rawStatus && (PROBLEM_STATUSES as readonly string[]).includes(rawStatus)
      ? (rawStatus as ProblemStatus)
      : "new";
  const raw = first(params.apres);
  const after = raw && CURSOR.test(raw) ? raw : undefined;
  const { account, token } = await requireVerifiedStaff("/equipe/signalements", "support");
  const queue = await staffApi().problems(token, { status, after });

  return (
    <StaffShell
      section="signalements"
      roles={account.roles}
      title="Signalements"
      crumbs={[{ label: "Signalements" }]}
      notice={staffNotice(first(params.ok))}
      error={staffErrorFromParam(first(params.erreur))}
    >
      <nav aria-label="État des signalements" className="flex flex-wrap gap-2">
        {PROBLEM_STATUSES.map((s) => (
          <Link
            key={s}
            href={`/equipe/signalements?etat=${s}`}
            aria-current={s === status ? "page" : undefined}
            className={
              s === status
                ? "bg-ink-900 rounded-full px-4 py-1.5 text-sm font-semibold text-white"
                : "border-ink-300 rounded-full border bg-white px-4 py-1.5 text-sm font-semibold"
            }
          >
            {PROBLEM_STATUS_LABELS[s]}
          </Link>
        ))}
      </nav>
      {!queue.ok ? (
        <FormAlert>{staffErrorMessage(queue.code)}</FormAlert>
      ) : queue.data.items.length === 0 ? (
        <p className="text-ink-500 rounded-xl bg-white p-5 text-sm">Aucun signalement ici.</p>
      ) : (
        <ul className="space-y-3">
          {queue.data.items.map((p) => (
            <li key={p.id} className="space-y-3 rounded-xl bg-white p-5">
              <p className="text-sm">
                <span className="font-semibold">{PROBLEM_CATEGORY_LABELS[p.category]}</span>
                <span className="text-ink-500">
                  {" "}
                  · {formatDateTime(p.createdAt)}
                  {p.device && <> · {p.device}</>}
                  {p.page && (
                    <>
                      {" "}
                      · page <code className="break-all">{p.page}</code>
                    </>
                  )}
                </span>
              </p>
              <p className="bg-ink-50 whitespace-pre-line rounded-lg p-3 text-sm">{p.message}</p>
              <p className="text-ink-600 text-sm">
                {p.reporter ? (
                  <>
                    {p.reporter.name}
                    {p.reporter.email ? <> · {p.reporter.email}</> : " · pas d'e-mail vérifié"}
                  </>
                ) : (
                  "Compte supprimé"
                )}
              </p>
              <div className="flex flex-wrap gap-2">
                {NEXT[p.status].map((step) => (
                  <form key={step.to} action={setProblemStatusAction}>
                    <input type="hidden" name="problemId" value={p.id} />
                    <input type="hidden" name="status" value={step.to} />
                    <input type="hidden" name="version" value={p.updatedAt} />
                    <button
                      type="submit"
                      className="border-ink-300 hover:bg-ink-50 rounded-full border px-4 py-2 text-sm font-semibold"
                    >
                      {step.label}
                    </button>
                  </form>
                ))}
              </div>
            </li>
          ))}
        </ul>
      )}
      {queue.ok && queue.data.nextCursor && (
        <Link
          href={`/equipe/signalements?etat=${status}&apres=${queue.data.nextCursor}`}
          className="text-brand-700 text-sm font-semibold underline"
        >
          Signalements suivants
        </Link>
      )}
    </StaffShell>
  );
}
