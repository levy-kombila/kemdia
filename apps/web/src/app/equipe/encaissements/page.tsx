import { Banknote } from "lucide-react";
import type { Metadata } from "next";
import { StaffShell, StatusBadge } from "@/components/staff/StaffShell";
import { FormAlert } from "@/components/ui/Field";
import { formatDateTime, formatFCFA } from "@/lib/format";
import { first } from "@/lib/search-params";
import { codCollectedAction } from "@/lib/staff/actions";
import { staffErrorFromParam, staffErrorMessage, staffNotice } from "@/lib/staff/messages";
import { requireVerifiedStaff, staffApi } from "@/lib/staff/staff";

export const metadata: Metadata = { title: "Encaissements" };

/**
 * Espèces à encaisser (S7.5-T05, ADR-0052), Finance : commandes payées à la livraison, expédiées ou livrées, pas
 * encore notées encaissées. Le montant attendu est prérempli ; l'API refuse tout autre montant. Une fois noté, la
 * commande est payée et sa facture établie.
 */
export default async function CashToCollectPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const { account, token } = await requireVerifiedStaff("/equipe/encaissements", "finance");
  const result = await staffApi().cashToCollect(token);

  return (
    <StaffShell
      section="encaissements"
      roles={account.roles}
      title="Espèces à encaisser"
      crumbs={[{ label: "Encaissements" }]}
      notice={staffNotice(first(params.ok))}
      error={staffErrorFromParam(first(params.erreur))}
    >
      {!result.ok ? (
        <FormAlert>{staffErrorMessage(result.code)}</FormAlert>
      ) : result.data.items.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-xl bg-white px-6 py-12 text-center">
          <Banknote className="text-ink-400 size-10" aria-hidden />
          <p className="font-semibold">Rien à encaisser.</p>
        </div>
      ) : (
        <ul className="space-y-2">
          {result.data.items.map((order) => (
            <li
              key={order.reference}
              className="flex flex-col gap-3 rounded-xl bg-white p-4 sm:flex-row sm:items-center"
            >
              <div className="min-w-0 flex-1">
                <p className="flex flex-wrap items-center gap-2">
                  <span className="font-bold">{order.reference}</span>
                  <StatusBadge tone={order.status === "delivered" ? "ok" : "wait"}>
                    {order.status === "delivered" ? "Livrée" : "En route"}
                  </StatusBadge>
                </p>
                <p className="text-ink-500 text-sm">
                  {order.cityName} · commandée le {formatDateTime(order.createdAt)} · à encaisser{" "}
                  <strong className="text-ink-900">{formatFCFA(order.total)}</strong>
                </p>
              </div>
              <form action={codCollectedAction} className="flex items-end gap-2">
                <input type="hidden" name="reference" value={order.reference} />
                <label className="block">
                  <span className="text-ink-800 mb-1 block text-xs font-semibold">
                    Montant reçu (FCFA)
                  </span>
                  <input
                    name="amount"
                    inputMode="numeric"
                    required
                    defaultValue={order.total}
                    pattern="[0-9 ]{1,12}"
                    className="border-ink-200 focus:border-brand-600 h-10 w-32 rounded-xl border bg-white px-3 outline-none"
                  />
                </label>
                <button
                  type="submit"
                  className="bg-forest-700 h-10 rounded-full px-4 text-sm font-semibold text-white hover:opacity-90"
                >
                  Noter l&apos;encaissement
                </button>
              </form>
            </li>
          ))}
        </ul>
      )}
    </StaffShell>
  );
}
