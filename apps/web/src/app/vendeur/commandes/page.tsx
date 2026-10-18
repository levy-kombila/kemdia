import { ChevronRight, ClipboardList } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { FormAlert } from "@/components/ui/Field";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { VendorShell } from "@/components/vendor/VendorShell";
import { cn } from "@/lib/cn";
import { formatDateTime, formatFCFA } from "@/lib/format";
import { first } from "@/lib/search-params";
import { CURSOR, deliveryState, ORDER_STATUS, ORDER_TABS } from "@/lib/vendor/labels";
import { vendorErrorMessage, vendorNotice } from "@/lib/vendor/messages";
import { requireActiveVendor, vendorApi } from "@/lib/vendor/vendor";

export const metadata: Metadata = { title: "Mes commandes" };

const PAGE_SIZE = 20;

/**
 * « Mes commandes » (S6-T07, BR-013) : commandes qui contiennent des produits de la boutique, de la plus récente à la
 * plus ancienne. Le vendeur ne voit que SES articles et la ville de livraison (jamais le nom ni l'adresse du client).
 */
export default async function VendorOrdersPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const status = ORDER_TABS.find((s) => s === first(params.statut));
  const raw = first(params.avant);
  const before = raw && CURSOR.test(raw) ? raw : undefined;
  const { token } = await requireActiveVendor(
    status ? `/vendeur/commandes?statut=${status}` : "/vendeur/commandes",
  );
  const result = await vendorApi().orders(token, { status, before, limit: PAGE_SIZE });

  const tabs: { id: string | undefined; label: string }[] = [
    { id: undefined, label: "Toutes" },
    ...ORDER_TABS.map((s) => ({ id: s, label: ORDER_STATUS[s].tab })),
  ];

  return (
    <VendorShell
      section="commandes"
      menu
      title="Mes commandes"
      crumbs={[{ label: "Mes commandes" }]}
      notice={vendorNotice(first(params.ok))}
    >
      <p className="text-ink-700 text-sm">
        Une nouvelle commande doit être acceptée ou refusée dans les 24 heures. Sans réponse, elle
        est annulée pour le client.
      </p>

      <nav aria-label="Statut des commandes" className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
        <ul className="flex gap-2">
          {tabs.map((tab) => (
            <li key={tab.label} className="shrink-0">
              <Link
                href={tab.id ? `/vendeur/commandes?statut=${tab.id}` : "/vendeur/commandes"}
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
        <FormAlert>{vendorErrorMessage(result.code)}</FormAlert>
      ) : result.data.items.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-xl bg-white px-6 py-12 text-center">
          <ClipboardList className="text-ink-400 size-10" aria-hidden />
          <p className="font-semibold">
            {before ? "Pas d'autre commande." : "Aucune commande dans cette liste."}
          </p>
        </div>
      ) : (
        <>
          <ul className="space-y-2">
            {result.data.items.map((order) => {
              const state = ORDER_STATUS[order.status];
              const delivery = deliveryState(order.status, order.orderStatus);
              return (
                <li key={order.reference}>
                  <Link
                    href={`/vendeur/commandes/${order.reference}`}
                    className="hover:ring-brand-100 flex items-center gap-3 rounded-xl bg-white p-4 transition hover:ring-4"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-center gap-2">
                        <span className="font-bold">{order.reference}</span>
                        <StatusBadge tone={state.tone}>{state.label}</StatusBadge>
                        {delivery && (
                          <StatusBadge tone={delivery.tone}>{delivery.label}</StatusBadge>
                        )}
                      </span>
                      <span className="text-ink-600 mt-1 block text-sm">
                        {order.itemCount} article{order.itemCount > 1 ? "s" : ""} ·{" "}
                        {formatFCFA(order.subtotal)} · {order.cityName}
                      </span>
                      <span className="text-ink-500 block text-sm">
                        {order.status === "pending"
                          ? `Répondre avant le ${formatDateTime(order.dueAt)}`
                          : `Reçue le ${formatDateTime(order.receivedAt)}`}
                      </span>
                    </span>
                    <ChevronRight className="text-ink-400 size-5 shrink-0" aria-hidden />
                  </Link>
                </li>
              );
            })}
          </ul>
          {result.data.nextCursor && (
            <Link
              href={`/vendeur/commandes?${status ? `statut=${status}&` : ""}avant=${result.data.nextCursor}`}
              className="border-ink-200 hover:bg-ink-50 inline-flex rounded-full border-2 bg-white px-5 py-2.5 text-sm font-semibold"
            >
              Commandes plus anciennes
            </Link>
          )}
        </>
      )}
    </VendorShell>
  );
}
