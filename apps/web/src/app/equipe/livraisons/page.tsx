import { ChevronRight, Settings2, Truck } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { StaffShell, StatusBadge } from "@/components/staff/StaffShell";
import { FormAlert } from "@/components/ui/Field";
import { cn } from "@/lib/cn";
import { formatDateTime, formatFCFA } from "@/lib/format";
import { first } from "@/lib/search-params";
import { shipmentStepAction } from "@/lib/staff/actions";
import {
  SHIPMENT_STATUS,
  SHIPPING_TABS,
  SHIPPING_TAB_LABEL,
  type ShippingTab,
} from "@/lib/staff/labels";
import { staffErrorFromParam, staffErrorMessage, staffNotice } from "@/lib/staff/messages";
import { requireVerifiedStaff, staffApi } from "@/lib/staff/staff";

export const metadata: Metadata = { title: "Livraisons" };

const PAYMENT_LABEL = {
  airtel: "Airtel Money",
  moov: "Moov Money",
  cod: "À la livraison",
} as const;

function Empty({ tab }: { tab: ShippingTab }) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-xl bg-white px-6 py-12 text-center">
      <Truck className="text-ink-400 size-10" aria-hidden />
      <p className="font-semibold">
        {tab === "ready" ? "Aucune commande à expédier." : "Aucune livraison dans cette liste."}
      </p>
    </div>
  );
}

/**
 * Livraisons (S7-T02, ADR-0041), administrateurs : commandes prêtes à remettre au transporteur (payées ou à la
 * livraison, tous les vendeurs d'accord), puis les expéditions par statut. Transporteur « manuel » : l'équipe prévient
 * le livreur et note chaque étape ici.
 */
export default async function ShippingPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const tab = SHIPPING_TABS.find((t) => t === first(params.statut)) ?? "ready";
  const { account, token } = await requireVerifiedStaff(
    tab === "ready" ? "/equipe/livraisons" : `/equipe/livraisons?statut=${tab}`,
    "logistics",
  );
  const api = staffApi();
  const [ready, shipments] = await Promise.all([
    tab === "ready" ? api.readyOrders(token) : null,
    tab === "ready" ? null : api.shipments(token, tab),
  ]);
  const failure = (ready && !ready.ok && ready) || (shipments && !shipments.ok && shipments);

  return (
    <StaffShell
      section="livraisons"
      roles={account.roles}
      title="Livraisons"
      crumbs={[{ label: "Livraisons" }]}
      notice={staffNotice(first(params.ok))}
      error={staffErrorFromParam(first(params.erreur))}
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <nav
          aria-label="Statut des livraisons"
          className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0"
        >
          <ul className="flex gap-2">
            {SHIPPING_TABS.map((t) => (
              <li key={t} className="shrink-0">
                <Link
                  href={t === "ready" ? "/equipe/livraisons" : `/equipe/livraisons?statut=${t}`}
                  aria-current={t === tab ? "page" : undefined}
                  className={cn(
                    "inline-flex rounded-full border-2 px-4 py-1.5 text-sm font-semibold",
                    t === tab
                      ? "border-ink-900 bg-ink-900 text-white"
                      : "border-ink-200 hover:bg-ink-50 bg-white",
                  )}
                >
                  {SHIPPING_TAB_LABEL[t]}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
        <Link
          href="/equipe/livraisons/bareme"
          className="text-brand-700 inline-flex items-center gap-1.5 text-sm font-semibold hover:underline"
        >
          <Settings2 className="size-4" aria-hidden /> Barème de livraison
        </Link>
      </div>

      {failure ? (
        <FormAlert>{staffErrorMessage(failure.code)}</FormAlert>
      ) : ready?.ok ? (
        ready.data.items.length === 0 ? (
          <Empty tab="ready" />
        ) : (
          <ul className="space-y-2">
            {ready.data.items.map((order) => (
              <li
                key={order.reference}
                className="flex flex-col gap-3 rounded-xl bg-white p-4 sm:flex-row sm:items-center"
              >
                <span className="min-w-0 flex-1">
                  <span className="block font-bold">{order.reference}</span>
                  <span className="text-ink-500 block text-sm">
                    {order.cityName} · {order.itemCount} article{order.itemCount > 1 ? "s" : ""} ·{" "}
                    {formatFCFA(order.total)} · {PAYMENT_LABEL[order.paymentMethod]}
                    {order.paymentMethod !== "cod" && (order.paid ? " (payée)" : " (non payée)")}
                  </span>
                  <span className="text-ink-500 block text-sm">
                    Commandée le {formatDateTime(order.createdAt)} · livraison{" "}
                    {order.deliveryFee > 0 ? formatFCFA(order.deliveryFee) : "offerte"}
                  </span>
                </span>
                <form action={shipmentStepAction}>
                  <input type="hidden" name="reference" value={order.reference} />
                  <input type="hidden" name="step" value="hand-over" />
                  <button
                    type="submit"
                    className="bg-forest-700 flex w-full items-center justify-center gap-2 rounded-full px-5 py-2.5 text-sm font-semibold text-white hover:opacity-90 sm:w-auto"
                  >
                    <Truck className="size-4" aria-hidden /> Remettre au transporteur
                  </button>
                </form>
              </li>
            ))}
          </ul>
        )
      ) : shipments?.ok ? (
        shipments.data.items.length === 0 ? (
          <Empty tab={tab} />
        ) : (
          <ul className="space-y-2">
            {shipments.data.items.map((s) => (
              <li key={s.reference}>
                <Link
                  href={`/equipe/livraisons/${s.reference}`}
                  className="hover:ring-brand-100 flex items-center gap-3 rounded-xl bg-white p-4 transition hover:ring-4"
                >
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="font-bold">{s.reference}</span>
                      <StatusBadge tone={SHIPMENT_STATUS[s.status].tone}>
                        {SHIPMENT_STATUS[s.status].label}
                      </StatusBadge>
                    </span>
                    <span className="text-ink-500 block text-sm">
                      {s.cityName} · tentative {s.attempt} · mise à jour le{" "}
                      {formatDateTime(s.updatedAt)}
                    </span>
                  </span>
                  <ChevronRight className="text-ink-400 size-5 shrink-0" aria-hidden />
                </Link>
              </li>
            ))}
          </ul>
        )
      ) : null}
      {tab === "ready" && (
        <p className="text-ink-500 text-sm">
          Une commande apparaît ici quand elle est payée (ou à payer à la livraison) et que tous ses
          vendeurs l&apos;ont acceptée. Les 100 plus anciennes d&apos;abord.
        </p>
      )}
    </StaffShell>
  );
}
