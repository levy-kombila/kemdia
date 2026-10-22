import type { Refund } from "@kemdia/contracts";
import { Undo2 } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { StaffShell } from "@/components/staff/StaffShell";
import { FormAlert } from "@/components/ui/Field";
import { cn } from "@/lib/cn";
import { formatDateTime, formatFCFA } from "@/lib/format";
import { first } from "@/lib/search-params";
import { refundDoneAction } from "@/lib/staff/actions";
import { staffErrorFromParam, staffErrorMessage, staffNotice } from "@/lib/staff/messages";
import { requireVerifiedStaff, staffApi } from "@/lib/staff/staff";

export const metadata: Metadata = { title: "Remboursements" };

const REASON: Record<Refund["reason"], string> = {
  annulation_admin: "commande annulée par l'équipe",
  paiement_non_attendu: "paiement reçu alors que la commande ne l'attendait plus",
  annulation_vendeur: "un vendeur a refusé ou n'a pas répondu",
  annulation_livraison: "livraison impossible, commande annulée",
};
const OPERATOR = { airtel: "Airtel Money", moov: "Moov Money" } as const;

/**
 * Remboursements Mobile Money (S7.5-T05, ADR-0052), Finance : à faire (les plus anciens d'abord) ou faits. Le
 * remboursement se fait chez l'opérateur ; on note ensuite ici sa référence (suivi manuel, en attendant l'API).
 */
export default async function RefundsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const status = first(params.statut) === "faits" ? "done" : "to_do";
  const { account, token } = await requireVerifiedStaff(
    status === "done" ? "/equipe/remboursements?statut=faits" : "/equipe/remboursements",
    "finance",
  );
  const result = await staffApi().refunds(token, status);
  const tabs = [
    { id: "to_do", label: "À faire", href: "/equipe/remboursements" },
    { id: "done", label: "Faits", href: "/equipe/remboursements?statut=faits" },
  ] as const;

  return (
    <StaffShell
      section="remboursements"
      roles={account.roles}
      title="Remboursements"
      crumbs={[{ label: "Remboursements" }]}
      notice={staffNotice(first(params.ok))}
      error={staffErrorFromParam(first(params.erreur))}
    >
      <nav aria-label="Statut des remboursements">
        <ul className="flex gap-2">
          {tabs.map((tab) => (
            <li key={tab.id}>
              <Link
                href={tab.href}
                aria-current={tab.id === status ? "page" : undefined}
                className={cn(
                  "inline-flex rounded-full border-2 px-4 py-1.5 text-sm font-semibold",
                  tab.id === status
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
          <Undo2 className="text-ink-400 size-10" aria-hidden />
          <p className="font-semibold">
            {status === "to_do" ? "Aucun remboursement à faire." : "Aucun remboursement fait."}
          </p>
        </div>
      ) : (
        <ul className="space-y-2">
          {result.data.items.map((refund) => (
            <li key={refund.id} className="space-y-2 rounded-xl bg-white p-4">
              <p className="font-bold">
                {formatFCFA(refund.amount)} · {OPERATOR[refund.method]} {refund.phone}
              </p>
              <p className="text-ink-500 text-sm">
                Commande {refund.orderReference} · {REASON[refund.reason]} · depuis le{" "}
                {formatDateTime(refund.createdAt)}
                {refund.doneAt &&
                  ` · fait le ${formatDateTime(refund.doneAt)} (réf. ${refund.externalReference ?? "—"})`}
              </p>
              {refund.status === "to_do" && (
                <form
                  action={refundDoneAction}
                  className="flex flex-col gap-2 sm:flex-row sm:items-end"
                >
                  <input type="hidden" name="refundId" value={refund.id} />
                  <label className="block">
                    <span className="text-ink-800 mb-1 block text-xs font-semibold">
                      Référence de l&apos;opération chez l&apos;opérateur
                    </span>
                    <input
                      name="externalReference"
                      required
                      minLength={3}
                      maxLength={100}
                      pattern="[A-Za-z0-9._/\-]{3,100}"
                      autoComplete="off"
                      className="border-ink-200 focus:border-brand-600 h-10 w-full rounded-xl border bg-white px-3 outline-none sm:w-64"
                    />
                  </label>
                  <button
                    type="submit"
                    className="bg-forest-700 h-10 rounded-full px-4 text-sm font-semibold text-white hover:opacity-90"
                  >
                    Noter fait
                  </button>
                </form>
              )}
            </li>
          ))}
        </ul>
      )}
    </StaffShell>
  );
}
