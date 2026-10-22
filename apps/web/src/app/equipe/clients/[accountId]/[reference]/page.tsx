import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { OrderStatusBadge } from "@/components/orders/OrderStatusBadge";
import { StaffShell } from "@/components/staff/StaffShell";
import { FormAlert } from "@/components/ui/Field";
import { formatDateTime, formatFCFA } from "@/lib/format";
import { isOrderReference } from "@/lib/orders/api-orders";
import { statusLabel } from "@/lib/orders/order-messages";
import { staffErrorMessage } from "@/lib/staff/messages";
import { requireVerifiedStaff, staffApi } from "@/lib/staff/staff";

export const metadata: Metadata = { title: "Commande du client" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const METHOD_LABEL = { airtel: "Airtel Money", moov: "Moov Money", cod: "Paiement à la livraison" };

/** Une commande d'un client, en lecture seule (S7.5-T04) : ce qu'il faut pour lui répondre, sans rien modifier. */
export default async function SupportOrderPage({
  params,
}: {
  params: Promise<{ accountId: string; reference: string }>;
}) {
  const { accountId, reference } = await params;
  if (!UUID.test(accountId) || !isOrderReference(reference)) notFound();
  const back = `/equipe/clients/${accountId}`;
  const { account, token } = await requireVerifiedStaff(`${back}/${reference}`, "support");
  const result = await staffApi().supportOrder(token, accountId, reference);
  if (!result.ok && result.code === "COMMANDE_INTROUVABLE") notFound();
  const crumbs = [
    { label: "Clients", href: "/equipe/clients" },
    { label: "Commandes", href: back },
    { label: reference },
  ];

  if (!result.ok) {
    return (
      <StaffShell section="clients" roles={account.roles} title={reference} crumbs={crumbs}>
        <FormAlert>{staffErrorMessage(result.code)}</FormAlert>
      </StaffShell>
    );
  }
  const order = result.data;
  return (
    <StaffShell section="clients" roles={account.roles} title={reference} crumbs={crumbs}>
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <OrderStatusBadge status={order.status} />
        <span className="text-ink-500">
          passée le {formatDateTime(order.createdAt)} · {METHOD_LABEL[order.paymentMethod]}
          {order.paidAt ? ` · payée le ${formatDateTime(order.paidAt)}` : ""}
        </span>
      </div>

      <section className="space-y-2 rounded-xl bg-white p-4">
        <h2 className="font-bold">Articles</h2>
        <ul className="divide-ink-100 divide-y text-sm">
          {order.lines.map((line) => (
            <li key={line.variantId} className="flex justify-between gap-3 py-2">
              <span>
                {line.title} — {line.variantName} × {line.quantity}
              </span>
              <span className="font-semibold">{formatFCFA(line.lineTotal)}</span>
            </li>
          ))}
        </ul>
        <dl className="text-sm">
          <div className="flex justify-between">
            <dt>Livraison</dt>
            <dd>{formatFCFA(order.deliveryFee)}</dd>
          </div>
          {order.discount > 0 && (
            <div className="flex justify-between">
              <dt>Réduction{order.couponCode ? ` (${order.couponCode})` : ""}</dt>
              <dd>−{formatFCFA(order.discount)}</dd>
            </div>
          )}
          <div className="flex justify-between font-bold">
            <dt>Total</dt>
            <dd>{formatFCFA(order.total)}</dd>
          </div>
        </dl>
      </section>

      <section className="space-y-1 rounded-xl bg-white p-4 text-sm">
        <h2 className="font-bold">Livraison</h2>
        <p>
          {order.delivery.fullName} · {order.delivery.phone}
        </p>
        <p>
          {order.delivery.cityName}, {order.delivery.neighborhood} — {order.delivery.landmark}
        </p>
      </section>

      <section className="space-y-1 rounded-xl bg-white p-4 text-sm">
        <h2 className="font-bold">Historique</h2>
        <ol className="space-y-1">
          {order.history.map((step) => (
            <li key={`${step.status}-${step.at}`}>
              {formatDateTime(step.at)} — {statusLabel(step.status)}
            </li>
          ))}
        </ol>
      </section>
    </StaffShell>
  );
}
