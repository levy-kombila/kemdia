import { ORDER_REFERENCE_PATTERN, VENDOR_ORDER_REFUSAL_LIMITS } from "@kemdia/contracts/constants";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { FormAlert } from "@/components/ui/Field";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { VendorShell } from "@/components/vendor/VendorShell";
import { formatDateTime, formatFCFA } from "@/lib/format";
import { first } from "@/lib/search-params";
import { acceptOrderAction, refuseOrderAction } from "@/lib/vendor/actions";
import { ORDER_STATUS } from "@/lib/vendor/labels";
import { vendorErrorFromParam, vendorErrorMessage, vendorNotice } from "@/lib/vendor/messages";
import { requireActiveVendor, vendorApi } from "@/lib/vendor/vendor";

export const metadata: Metadata = { title: "Commande" };

const primaryButton =
  "bg-brand-600 hover:bg-brand-700 rounded-full px-5 py-2.5 font-semibold text-white";

/**
 * Fiche d'une commande pour la boutique (S6-T07, BR-013) : SES articles, la ville de livraison, le délai de réponse.
 * Accepter, ou refuser avec un motif : un refus annule la commande ENTIÈRE (choix du 2026-10-17). Formulaires HTML
 * simples (marchent sans JavaScript) ; l'API revérifie tout.
 */
export default async function VendorOrderPage({
  params,
  searchParams,
}: {
  params: Promise<{ reference: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ reference }, query] = await Promise.all([params, searchParams]);
  if (!ORDER_REFERENCE_PATTERN.test(reference)) notFound();
  const { token } = await requireActiveVendor(`/vendeur/commandes/${reference}`);
  const result = await vendorApi().order(token, reference);
  if (!result.ok && result.code === "COMMANDE_INTROUVABLE") notFound();

  const crumbs = [{ label: "Mes commandes", href: "/vendeur/commandes" }, { label: reference }];
  if (!result.ok) {
    return (
      <VendorShell section="commandes" menu title={`Commande ${reference}`} crumbs={crumbs}>
        <FormAlert>{vendorErrorMessage(result.code)}</FormAlert>
      </VendorShell>
    );
  }

  const order = result.data;
  const state = ORDER_STATUS[order.status];
  const hidden = <input type="hidden" name="reference" value={order.reference} />;

  return (
    <VendorShell
      section="commandes"
      menu
      title={`Commande ${order.reference}`}
      crumbs={crumbs}
      notice={vendorNotice(first(query.ok))}
      error={vendorErrorFromParam(first(query.erreur))}
    >
      <section aria-label="État de la commande" className="space-y-2 rounded-xl bg-white p-5">
        <StatusBadge tone={state.tone}>{state.label}</StatusBadge>
        <dl className="grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-ink-500 inline">Reçue le </dt>
            <dd className="inline font-semibold">{formatDateTime(order.receivedAt)}</dd>
          </div>
          <div>
            <dt className="text-ink-500 inline">Livraison à </dt>
            <dd className="inline font-semibold">{order.cityName}</dd>
          </div>
          {order.status === "pending" ? (
            <div className="sm:col-span-2">
              <dt className="text-ink-500 inline">Répondre avant le </dt>
              <dd className="inline font-semibold">{formatDateTime(order.dueAt)}</dd>
            </div>
          ) : (
            order.decidedAt && (
              <div className="sm:col-span-2">
                <dt className="text-ink-500 inline">Décision le </dt>
                <dd className="inline font-semibold">{formatDateTime(order.decidedAt)}</dd>
              </div>
            )
          )}
        </dl>
        {order.refusalReason && (
          <p className="text-ink-700 text-sm">
            Votre motif de refus : <span className="italic">{order.refusalReason}</span>
          </p>
        )}
      </section>

      <section aria-labelledby="articles" className="rounded-xl bg-white p-5">
        <h2 id="articles" className="font-bold">
          Vos articles dans cette commande
        </h2>
        <ul className="divide-ink-100 mt-3 divide-y">
          {order.lines.map((line) => (
            <li key={line.variantId} className="flex justify-between gap-3 py-2 text-sm">
              <span className="min-w-0">
                <span className="block font-semibold">{line.title}</span>
                <span className="text-ink-500 block">
                  {line.variantName} · {line.quantity} × {formatFCFA(line.unitPrice)}
                </span>
              </span>
              <span className="shrink-0 font-semibold">{formatFCFA(line.lineTotal)}</span>
            </li>
          ))}
        </ul>
        <p className="border-ink-100 mt-2 flex justify-between border-t pt-3 font-bold">
          <span>Total de vos articles</span>
          <span>{formatFCFA(order.subtotal)}</span>
        </p>
        <p className="text-ink-500 mt-1 text-xs">
          Prix au moment de la commande, hors livraison et réduction.
        </p>
      </section>

      {order.canDecide && (
        <section aria-labelledby="decision" className="space-y-4 rounded-xl bg-white p-5">
          <h2 id="decision" className="font-bold">
            Votre réponse
          </h2>
          <form action={acceptOrderAction} className="space-y-2">
            {hidden}
            <p className="text-ink-700 text-sm">
              Acceptez si vous avez tous ces articles et pouvez les préparer.
            </p>
            <button type="submit" className={primaryButton}>
              Accepter la commande
            </button>
          </form>
          <details>
            <summary className="text-brand-700 cursor-pointer font-semibold">
              Refuser la commande…
            </summary>
            <form action={refuseOrderAction} className="mt-3 space-y-2">
              {hidden}
              <p className="text-ink-700 text-sm">
                Un refus annule la commande <strong>entière</strong> pour le client (stock rendu,
                remboursement s&apos;il avait payé). Le motif reste chez Kemdia : le client ne le
                voit pas.
              </p>
              <label htmlFor="reason" className="block text-sm font-semibold">
                Motif du refus
              </label>
              <textarea
                id="reason"
                name="reason"
                required
                minLength={VENDOR_ORDER_REFUSAL_LIMITS.min}
                maxLength={VENDOR_ORDER_REFUSAL_LIMITS.max}
                rows={3}
                className="border-ink-200 focus:border-brand-600 w-full rounded-lg border-2 px-3 py-2"
              />
              <button type="submit" className={primaryButton}>
                Refuser et annuler la commande
              </button>
            </form>
          </details>
        </section>
      )}
    </VendorShell>
  );
}
