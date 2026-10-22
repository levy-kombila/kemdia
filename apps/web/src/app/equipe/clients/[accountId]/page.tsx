import { ORDER_CURSOR_PATTERN } from "@kemdia/contracts";
import { ChevronRight, Package } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { OrderStatusBadge } from "@/components/orders/OrderStatusBadge";
import { StaffShell } from "@/components/staff/StaffShell";
import { FormAlert } from "@/components/ui/Field";
import { formatDateTime, formatFCFA } from "@/lib/format";
import { first } from "@/lib/search-params";
import { staffErrorMessage } from "@/lib/staff/messages";
import { requireVerifiedStaff, staffApi } from "@/lib/staff/staff";

export const metadata: Metadata = { title: "Commandes du client" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** Commandes d'un client vues par le service client (S7.5-T04) : de la plus récente à la plus ancienne, lecture seule. */
export default async function SupportOrdersPage({
  params,
  searchParams,
}: {
  params: Promise<{ accountId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { accountId } = await params;
  if (!UUID.test(accountId)) notFound();
  const raw = first((await searchParams).avant);
  const before = raw && ORDER_CURSOR_PATTERN.test(raw) ? raw : undefined;
  const page = `/equipe/clients/${accountId}`;
  const { account, token } = await requireVerifiedStaff(page, "support");
  const result = await staffApi().supportOrders(token, accountId, before);
  if (!result.ok && result.code === "COMPTE_INTROUVABLE") notFound();
  const crumbs = [{ label: "Clients", href: "/equipe/clients" }, { label: "Commandes" }];

  return (
    <StaffShell section="clients" roles={account.roles} title="Commandes du client" crumbs={crumbs}>
      {!result.ok ? (
        <FormAlert>{staffErrorMessage(result.code)}</FormAlert>
      ) : result.data.items.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-xl bg-white px-6 py-12 text-center">
          <Package className="text-ink-400 size-10" aria-hidden />
          <p className="font-semibold">
            {before ? "Pas d'autre commande." : "Ce client n'a pas encore commandé."}
          </p>
        </div>
      ) : (
        <>
          <ul className="space-y-2">
            {result.data.items.map((order) => (
              <li key={order.id}>
                <Link
                  href={`${page}/${order.reference}`}
                  className="hover:ring-brand-100 flex items-center gap-3 rounded-xl bg-white p-4 transition hover:ring-4"
                >
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="font-bold">{order.reference}</span>
                      <OrderStatusBadge status={order.status} />
                    </span>
                    <span className="text-ink-500 block text-sm">
                      {formatDateTime(order.createdAt)} · {order.itemCount} article
                      {order.itemCount > 1 ? "s" : ""} · {formatFCFA(order.total)}
                    </span>
                  </span>
                  <ChevronRight className="text-ink-400 size-5 shrink-0" aria-hidden />
                </Link>
              </li>
            ))}
          </ul>
          {result.data.nextCursor && (
            <Link
              href={`${page}?avant=${result.data.nextCursor}`}
              className="border-ink-200 hover:bg-ink-50 inline-flex rounded-full border-2 bg-white px-5 py-2.5 text-sm font-semibold"
            >
              Commandes plus anciennes
            </Link>
          )}
        </>
      )}
    </StaffShell>
  );
}
