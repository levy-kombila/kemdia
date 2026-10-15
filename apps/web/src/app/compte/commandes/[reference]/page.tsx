import type { InvoiceSummary, Order, Payment } from "@kemdia/contracts";
import { CircleCheck, FileDown, Truck, Wallet } from "lucide-react";
import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Breadcrumbs } from "@/components/catalog/Breadcrumbs";
import { CancelOrderForm } from "@/components/orders/CancelOrderForm";
import { OrderStatusBadge } from "@/components/orders/OrderStatusBadge";
import { PaymentPanel } from "@/components/orders/PaymentPanel";
import { AutoRefresh } from "@/components/payments/AutoRefresh";
import { FormAlert } from "@/components/ui/Field";
import { formatGabonPhone } from "@/lib/auth/validation";
import { OTHER_NEIGHBORHOOD } from "@/lib/checkout";
import { deliveryWindow } from "@/lib/delivery";
import { formatDate, formatDateTime, formatFCFA } from "@/lib/format";
import { isOrderReference } from "@/lib/orders/api-orders";
import { orderMessage, statusLabel } from "@/lib/orders/order-messages";
import { ordersApi, requireAccount, sessionToken } from "@/lib/orders/orders";
import { sandboxPageEnabled } from "@/lib/payments/sandbox";
import { first } from "@/lib/search-params";

export const metadata: Metadata = { title: "Ma commande", robots: { index: false } };

/** Message du tunnel (première demande de paiement non partie) : un code connu seulement, jamais du texte libre. */
const TUNNEL_ERRORS = [
  "PAIEMENT_INDISPONIBLE",
  "TROP_D_ESSAIS_PAIEMENT",
  "TROP_DE_REQUETES",
  "INDISPONIBLE",
] as const;

const METHOD_LABEL = { airtel: "Airtel Money", moov: "Moov Money", cod: "Paiement à la livraison" };

const CANCEL_REASON: Record<NonNullable<Order["cancelReason"]>, string> = {
  client: "annulée à votre demande",
  paiement_expire: "paiement non reçu à temps",
  admin: "annulée par le service client",
};

/**
 * Détail d'une commande (S5-T07, choix du 2026-10-15) : c'est aussi la page d'attente du paiement Mobile Money. Tant
 * que la commande attend son paiement, elle se relit toute seule toutes les 5 s (onglet visible seulement), et elle
 * résiste au rechargement. L'API ne rend que les commandes du compte connecté (sinon 404).
 */
export default async function OrderPage({
  params,
  searchParams,
}: {
  params: Promise<{ reference: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ reference }, query] = await Promise.all([params, searchParams]);
  if (!isOrderReference(reference)) notFound();
  const account = await requireAccount(`/compte/commandes/${reference}`);
  const token = (await sessionToken())!;
  const api = ordersApi();
  const result = await api.get(token, reference);
  if (!result.ok && result.code === "COMMANDE_INTROUVABLE") notFound();

  const crumbs = [
    { label: "Mon compte", href: "/compte" },
    { label: "Mes commandes", href: "/compte/commandes" },
    { label: reference },
  ];
  if (!result.ok) {
    return (
      <div className="container-page py-6">
        <Breadcrumbs items={crumbs} />
        <div className="mx-auto max-w-2xl">
          <FormAlert>{orderMessage(result.code)}</FormAlert>
        </div>
      </div>
    );
  }

  const order = result.data;
  const mobileMoney = order.paymentMethod !== "cod";
  const waitingPayment = order.status === "pending_payment";
  const [payment, invoices] = await Promise.all([
    waitingPayment && mobileMoney ? api.latestPayment(token, reference) : null,
    order.paidAt ? api.invoices(token, reference) : null,
  ]);
  const latest: Payment | null = payment?.ok ? payment.data : null;
  const fresh = first(query.nouvelle) === "1";
  const tunnelError = TUNNEL_ERRORS.find((code) => code === first(query.paiement));

  return (
    <div className="container-page py-6">
      <Breadcrumbs items={crumbs} />
      {waitingPayment && <AutoRefresh seconds={5} />}
      <div className="mx-auto max-w-2xl space-y-3">
        {fresh && order.status !== "cancelled" && (
          <div className="rounded-xl bg-white px-6 py-6 text-center">
            <CircleCheck className="text-forest-600 mx-auto size-12" aria-hidden />
            <p className="mt-2 text-xl font-extrabold">
              {waitingPayment
                ? `Merci ${account.firstName}, votre commande est enregistrée`
                : `Merci ${account.firstName}, votre commande est confirmée`}
            </p>
            <p className="text-ink-500 mt-1 text-sm">
              {waitingPayment
                ? "Il ne reste plus qu'à valider le paiement sur votre téléphone."
                : order.paymentMethod === "cod"
                  ? "Vous paierez au livreur, à la réception."
                  : "Paiement reçu : votre facture vous est envoyée par e-mail."}
            </p>
          </div>
        )}

        <header className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-white p-5">
          <div>
            <h1 className="font-price text-2xl font-extrabold tracking-wide">{order.reference}</h1>
            <p className="text-ink-500 text-sm">Passée le {formatDateTime(order.createdAt)}</p>
          </div>
          <OrderStatusBadge status={order.status} />
        </header>

        {waitingPayment && mobileMoney && (
          <PaymentPanel
            reference={order.reference}
            total={order.total}
            method={order.paymentMethod as "airtel" | "moov"}
            payment={latest}
            dueAt={order.paymentDueAt}
            sandbox={sandboxPageEnabled()}
            initialError={tunnelError ? orderMessage(tunnelError) : undefined}
          />
        )}

        {order.status === "cancelled" && (
          <FormAlert tone="info">
            Commande annulée
            {order.cancelledAt ? ` le ${formatDateTime(order.cancelledAt)}` : ""}
            {order.cancelReason ? ` (${CANCEL_REASON[order.cancelReason]})` : ""}.
            {order.paidAt &&
              " Le paiement reçu vous est remboursé par le service client sur votre numéro Mobile Money."}
          </FormAlert>
        )}

        <Lines order={order} />
        <Details order={order} />
        {invoices && <Invoices order={order} result={invoices} />}
        <History order={order} />

        <section className="space-y-2 rounded-xl bg-white p-5">
          <h2 className="text-lg font-extrabold">Besoin de changer quelque chose ?</h2>
          {order.canCancel ? (
            <CancelOrderForm reference={order.reference} />
          ) : order.status === "cancelled" || order.status === "delivered" ? (
            <p className="text-ink-700 text-sm">
              <Link href="/" className="text-brand-700 font-semibold underline">
                Continuer mes achats
              </Link>
            </p>
          ) : (
            <p className="text-ink-700 text-sm">
              {order.status === "shipped"
                ? "La commande est partie : pour toute question, contactez le service client."
                : "Commande payée : pour l'annuler et être remboursé, contactez le service client."}{" "}
              <Link href="/infos/contact" className="text-brand-700 font-semibold underline">
                Nous contacter
              </Link>
            </p>
          )}
        </section>
      </div>
    </div>
  );
}

function Lines({ order }: { order: Order }) {
  return (
    <section aria-labelledby="articles" className="rounded-xl bg-white p-5">
      <h2 id="articles" className="mb-2 text-lg font-extrabold">
        Articles
      </h2>
      <ul className="divide-ink-100 divide-y">
        {order.lines.map((l) => (
          <li key={l.variantId} className="flex items-center gap-3 py-2.5">
            <span className="border-ink-100 relative size-14 shrink-0 overflow-hidden rounded-lg border bg-white">
              {l.image && (
                <Image src={l.image} alt="" fill sizes="56px" className="object-contain p-1" />
              )}
            </span>
            <span className="min-w-0 flex-1 text-sm">
              <span className="line-clamp-2">{l.title}</span>
              <span className="text-ink-500">
                {l.variantName && `${l.variantName} · `}
                {l.quantity} × {formatFCFA(l.unitPrice)}
              </span>
            </span>
            <span className="whitespace-nowrap text-sm font-semibold">
              {formatFCFA(l.lineTotal)}
            </span>
          </li>
        ))}
      </ul>
      <dl className="border-ink-100 mt-2 space-y-1.5 border-t pt-3 text-sm">
        <div className="flex justify-between">
          <dt>Articles</dt>
          <dd className="font-semibold">{formatFCFA(order.subtotal)}</dd>
        </div>
        {order.discount > 0 && (
          <div className="text-forest-700 flex justify-between">
            <dt>Code promo {order.couponCode}</dt>
            <dd className="font-semibold">− {formatFCFA(order.discount)}</dd>
          </div>
        )}
        <div className="flex justify-between">
          <dt>Livraison</dt>
          <dd className="font-semibold">
            {order.deliveryFee === 0 ? "Offerte" : formatFCFA(order.deliveryFee)}
          </dd>
        </div>
        <div className="flex justify-between text-base">
          <dt className="font-bold">Total</dt>
          <dd className="font-extrabold">{formatFCFA(order.total)}</dd>
        </div>
      </dl>
    </section>
  );
}

function Details({ order }: { order: Order }) {
  const d = order.delivery;
  const open = order.status !== "cancelled" && order.status !== "delivered";
  return (
    <dl className="divide-ink-100 grid divide-y rounded-xl bg-white text-sm">
      <div className="flex gap-4 px-5 py-3.5">
        <dt className="text-ink-500 flex w-28 shrink-0 items-start gap-1.5">
          <Truck className="mt-0.5 size-4" aria-hidden /> Livraison
        </dt>
        <dd>
          {open && (
            <>
              Prévue{" "}
              <strong>{deliveryWindow(new Date(order.createdAt), d.daysMin, d.daysMax)}</strong>
              <br />
            </>
          )}
          {d.fullName} · {formatGabonPhone(d.phone)}
          <br />
          {d.neighborhood !== OTHER_NEIGHBORHOOD && `${d.neighborhood}, `}
          {d.cityName} · {d.landmark}
        </dd>
      </div>
      <div className="flex gap-4 px-5 py-3.5">
        <dt className="text-ink-500 flex w-28 shrink-0 items-start gap-1.5">
          <Wallet className="mt-0.5 size-4" aria-hidden /> Paiement
        </dt>
        <dd>
          {METHOD_LABEL[order.paymentMethod]}
          {order.paymentPhone && ` · ${formatGabonPhone(order.paymentPhone)}`}
          <br />
          {order.paidAt
            ? `Payé le ${formatDateTime(order.paidAt)}`
            : order.paymentMethod === "cod"
              ? order.status === "cancelled"
                ? "Non payé"
                : "À régler au livreur, à la réception"
              : "Non payé"}
        </dd>
      </div>
    </dl>
  );
}

function Invoices({
  order,
  result,
}: {
  order: Order;
  result: { ok: true; data: { items: InvoiceSummary[] } } | { ok: false; code: string };
}) {
  return (
    <section aria-labelledby="factures" className="rounded-xl bg-white p-5">
      <h2 id="factures" className="mb-2 text-lg font-extrabold">
        Factures
      </h2>
      {!result.ok ? (
        <p className="text-ink-500 text-sm">
          Les factures ne peuvent pas être affichées pour le moment. Réessayez dans un instant.
        </p>
      ) : result.data.items.length === 0 ? (
        <p className="text-ink-500 text-sm">
          Votre facture est en préparation : elle apparaîtra ici et vous sera envoyée par e-mail.
        </p>
      ) : (
        <ul className="space-y-2">
          {result.data.items.map((invoice) => (
            <li key={invoice.number}>
              <a
                href={`/compte/commandes/${order.reference}/factures/${invoice.number}`}
                download={`${invoice.number}.pdf`}
                className="border-ink-100 hover:bg-ink-50 flex items-center gap-3 rounded-xl border p-3 text-sm"
              >
                <FileDown className="text-brand-600 size-5 shrink-0" aria-hidden />
                <span className="flex-1">
                  <span className="block font-semibold">
                    {invoice.kind === "invoice" ? "Facture" : "Avoir"} {invoice.number}
                  </span>
                  <span className="text-ink-500">
                    {formatDate(invoice.issuedAt)} · {formatFCFA(invoice.total)} · PDF
                  </span>
                </span>
                <span className="text-brand-700 font-semibold">Télécharger</span>
              </a>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function History({ order }: { order: Order }) {
  return (
    <section aria-labelledby="suivi" className="rounded-xl bg-white p-5">
      <h2 id="suivi" className="mb-2 text-lg font-extrabold">
        Suivi
      </h2>
      <ol className="border-ink-100 space-y-2 border-l-2 pl-4 text-sm">
        {order.history.map((step) => (
          <li key={`${step.status}-${step.at}`}>
            <span className="font-semibold">{statusLabel(step.status)}</span>
            <span className="text-ink-500"> · {formatDateTime(step.at)}</span>
          </li>
        ))}
      </ol>
    </section>
  );
}
