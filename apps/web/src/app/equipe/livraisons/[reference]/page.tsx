import { SHIPPING_LIMITS } from "@kemdia/contracts/constants";
import { CheckCircle2, RotateCcw, TriangleAlert, XCircle } from "lucide-react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { StaffShell, StatusBadge } from "@/components/staff/StaffShell";
import { FormAlert } from "@/components/ui/Field";
import { formatDateTime, formatFCFA } from "@/lib/format";
import { first } from "@/lib/search-params";
import { shipmentStepAction } from "@/lib/staff/actions";
import { SHIPMENT_STATUS } from "@/lib/staff/labels";
import { staffErrorFromParam, staffErrorMessage, staffNotice } from "@/lib/staff/messages";
import { requireVerifiedStaff, staffApi } from "@/lib/staff/staff";

export const metadata: Metadata = { title: "Livraison" };

const ORDER_REFERENCE = /^KMD-[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{6}$/;

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-1 py-2 sm:grid-cols-[12rem_1fr]">
      <dt className="text-ink-500 text-sm font-semibold">{label}</dt>
      <dd className="min-w-0 break-words">{children}</dd>
    </div>
  );
}

function StepButton({
  reference,
  step,
  tone,
  children,
}: {
  reference: string;
  step: "delivered" | "retry";
  tone: "ok" | "neutral";
  children: React.ReactNode;
}) {
  return (
    <form action={shipmentStepAction}>
      <input type="hidden" name="reference" value={reference} />
      <input type="hidden" name="step" value={step} />
      <button
        type="submit"
        className={
          tone === "ok"
            ? "bg-forest-700 flex w-full items-center justify-center gap-2 rounded-full px-6 py-3 font-semibold text-white hover:opacity-90 sm:w-auto"
            : "border-ink-200 hover:bg-ink-50 flex w-full items-center justify-center gap-2 rounded-full border-2 bg-white px-6 py-3 font-semibold sm:w-auto"
        }
      >
        {children}
      </button>
    </form>
  );
}

/** Échec (motif) ou annulation (note) : repliés, pour qu'un clic distrait ne suffise pas. */
function TextStep({
  reference,
  step,
  button,
  label,
  help,
}: {
  reference: string;
  step: "failed" | "cancel";
  button: string;
  label: string;
  help: string;
}) {
  const Icon = step === "failed" ? TriangleAlert : XCircle;
  return (
    <details className="border-ink-200 rounded-xl border-2 bg-white">
      <summary className="text-brand-700 flex cursor-pointer items-center gap-2 px-5 py-3 font-semibold">
        <Icon className="size-5" aria-hidden /> {button}…
      </summary>
      <form action={shipmentStepAction} className="space-y-3 px-5 pb-5">
        <input type="hidden" name="reference" value={reference} />
        <input type="hidden" name="step" value={step} />
        <label className="block">
          <span className="text-ink-800 mb-1.5 block text-sm font-semibold">{label}</span>
          <textarea
            name="reason"
            required
            minLength={SHIPPING_LIMITS.reasonMin}
            maxLength={SHIPPING_LIMITS.reasonMax}
            rows={3}
            className="border-ink-200 focus:border-brand-600 focus:ring-brand-100 w-full rounded-xl border bg-white px-4 py-3 text-base outline-none focus:ring-4"
          />
          <span className="text-ink-500 mt-1 block text-sm">
            {SHIPPING_LIMITS.reasonMin} à {SHIPPING_LIMITS.reasonMax} caractères. {help}
          </span>
        </label>
        <button
          type="submit"
          className="bg-brand-600 hover:bg-brand-700 rounded-full px-6 py-2.5 font-semibold text-white"
        >
          {button}
        </button>
      </form>
    </details>
  );
}

/**
 * Fiche d'une livraison (S7-T02), administrateurs : frais et parts (BR-021), historique, et l'étape suivante — livrée,
 * échec, nouvelle tentative ou annulation de la commande.
 */
export default async function ShipmentPage({
  params,
  searchParams,
}: {
  params: Promise<{ reference: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ reference }, query] = await Promise.all([params, searchParams]);
  if (!ORDER_REFERENCE.test(reference)) notFound();
  const { token } = await requireVerifiedStaff(`/equipe/livraisons/${reference}`, "admin");
  const result = await staffApi().shipment(token, reference);
  if (!result.ok && result.code === "EXPEDITION_INTROUVABLE") notFound();
  const crumbs = [{ label: "Livraisons", href: "/equipe/livraisons" }, { label: reference }];
  if (!result.ok) {
    return (
      <StaffShell section="livraisons" admin title={reference} crumbs={crumbs}>
        <FormAlert>{staffErrorMessage(result.code)}</FormAlert>
      </StaffShell>
    );
  }
  const s = result.data;
  const state = SHIPMENT_STATUS[s.status];
  // Le motif et la note sont écrits par l'équipe : jamais le nom ni le téléphone du client
  const privacy = "N'y écrivez ni le nom, ni le téléphone, ni l'adresse du client.";

  return (
    <StaffShell
      section="livraisons"
      admin
      title={`Livraison ${s.reference}`}
      crumbs={crumbs}
      notice={staffNotice(first(query.ok))}
      error={staffErrorFromParam(first(query.erreur))}
    >
      <section aria-label="Livraison" className="rounded-xl bg-white p-6">
        <dl className="divide-ink-100 divide-y">
          <Row label="Statut">
            <StatusBadge tone={state.tone}>{state.label}</StatusBadge>
          </Row>
          <Row label="Ville">{s.cityName}</Row>
          <Row label="Tentative">{s.attempt}</Row>
          <Row label="Transporteur">
            {s.carrier === "manuel" ? "Suivi à la main par l'équipe" : s.carrier}
          </Row>
          <Row label="Frais facturés">
            {s.deliveryFee > 0 ? formatFCFA(s.deliveryFee) : "Livraison offerte"}
          </Row>
          {s.deliveryFee > 0 && (
            <Row label="Parts (BR-021)">
              Kemdia {formatFCFA(s.kemdiaShare)} · transporteur {formatFCFA(s.carrierShare)}
            </Row>
          )}
          <Row label="Remise le">{formatDateTime(s.handedOverAt)}</Row>
          {s.failureReason && <Row label="Motif de l'échec">{s.failureReason}</Row>}
        </dl>
      </section>

      <section aria-labelledby="etapes" className="rounded-xl bg-white p-6">
        <h2 id="etapes" className="mb-2 font-bold">
          Étapes
        </h2>
        <ol className="border-ink-100 space-y-2 border-l-2 pl-4 text-sm">
          {s.events.map((e, i) => (
            <li key={`${e.status}-${e.at}-${i}`}>
              <span className="font-semibold">{SHIPMENT_STATUS[e.status].label}</span>
              <span className="text-ink-500"> · {formatDateTime(e.at)}</span>
              {e.note && <span className="text-ink-700 block">{e.note}</span>}
            </li>
          ))}
        </ol>
      </section>

      {s.status === "in_transit" && (
        <section aria-label="Étape suivante" className="space-y-3">
          <StepButton reference={s.reference} step="delivered" tone="ok">
            <CheckCircle2 className="size-5" aria-hidden /> Noter la commande livrée
          </StepButton>
          <TextStep
            reference={s.reference}
            step="failed"
            button="Noter un échec de livraison"
            label="Pourquoi la livraison n'a pas pu se faire ?"
            help={privacy}
          />
        </section>
      )}
      {s.status === "failed" && (
        <section aria-label="Étape suivante" className="space-y-3">
          <StepButton reference={s.reference} step="retry" tone="neutral">
            <RotateCcw className="size-5" aria-hidden /> Nouvelle tentative de livraison
          </StepButton>
          <TextStep
            reference={s.reference}
            step="cancel"
            button="Annuler la commande"
            label="Note pour le service client (journal d'audit)"
            help={`Stock et coupon rendus ; un paiement Mobile Money sera à rembourser. ${privacy}`}
          />
        </section>
      )}
    </StaffShell>
  );
}
