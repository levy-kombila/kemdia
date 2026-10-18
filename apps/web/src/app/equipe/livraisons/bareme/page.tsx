import { SHIPPING_LIMITS } from "@kemdia/contracts/constants";
import type { Metadata } from "next";
import { StaffShell } from "@/components/staff/StaffShell";
import { FormAlert } from "@/components/ui/Field";
import { formatDateTime } from "@/lib/format";
import { first } from "@/lib/search-params";
import { updateTariffsAction } from "@/lib/staff/actions";
import { staffErrorFromParam, staffErrorMessage, staffNotice } from "@/lib/staff/messages";
import { requireVerifiedStaff, staffApi } from "@/lib/staff/staff";

export const metadata: Metadata = { title: "Barème de livraison" };

const input =
  "border-ink-200 focus:border-brand-600 focus:ring-brand-100 w-full rounded-xl border bg-white px-3 py-2.5 text-base outline-none focus:ring-4";

function NumberField({
  name,
  label,
  value,
  max,
  suffix,
}: {
  name: string;
  label: string;
  value: number;
  max: number;
  suffix: string;
}) {
  return (
    <label className="block">
      <span className="text-ink-800 mb-1 block text-sm font-semibold">{label}</span>
      <span className="flex items-center gap-2">
        <input
          name={name}
          type="number"
          inputMode="numeric"
          required
          min={0}
          max={max}
          step={1}
          defaultValue={value}
          className={input}
        />
        <span className="text-ink-500 shrink-0 text-sm">{suffix}</span>
      </span>
    </label>
  );
}

/**
 * Barème de livraison des 4 zones (S7-T02, ADR-0041), administrateurs : frais de base, livraison offerte dès, délais.
 * Le devis et la commande l'appliquent aussitôt ; le site l'affiche dans 5 minutes au plus. Les suppléments par ville
 * restent dans le code.
 */
export default async function TariffsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const { token } = await requireVerifiedStaff("/equipe/livraisons/bareme", "admin");
  const result = await staffApi().tariffs(token);
  const crumbs = [{ label: "Livraisons", href: "/equipe/livraisons" }, { label: "Barème" }];

  return (
    <StaffShell
      section="livraisons"
      admin
      title="Barème de livraison"
      crumbs={crumbs}
      notice={staffNotice(first(params.ok))}
      error={staffErrorFromParam(first(params.erreur))}
    >
      {!result.ok ? (
        <FormAlert>{staffErrorMessage(result.code)}</FormAlert>
      ) : (
        <form action={updateTariffsAction} className="space-y-4">
          <p className="text-ink-500 text-sm">
            Montants en FCFA entiers. Le prix payé par le client change tout de suite ; un client en
            train de payer voit le nouveau total avant de valider.
            {result.data.updatedAt &&
              ` Dernier changement : ${formatDateTime(result.data.updatedAt)}.`}
          </p>
          {result.data.zones.map((z) => (
            <fieldset key={z.id} className="space-y-3 rounded-xl bg-white p-5">
              <legend className="font-bold">{z.label}</legend>
              <div className="grid gap-3 sm:grid-cols-2">
                <NumberField
                  name={`${z.id}.baseFee`}
                  label="Frais de base"
                  value={z.baseFee}
                  max={SHIPPING_LIMITS.baseFeeMax}
                  suffix="FCFA"
                />
                <NumberField
                  name={`${z.id}.freeThreshold`}
                  label="Livraison offerte dès"
                  value={z.freeThreshold}
                  max={SHIPPING_LIMITS.freeThresholdMax}
                  suffix="FCFA"
                />
                <NumberField
                  name={`${z.id}.daysMin`}
                  label="Délai minimum"
                  value={z.daysMin}
                  max={SHIPPING_LIMITS.daysMax}
                  suffix="jours"
                />
                <NumberField
                  name={`${z.id}.daysMax`}
                  label="Délai maximum"
                  value={z.daysMax}
                  max={SHIPPING_LIMITS.daysMax}
                  suffix="jours"
                />
              </div>
            </fieldset>
          ))}
          <button
            type="submit"
            className="bg-brand-600 hover:bg-brand-700 w-full rounded-full px-6 py-3 font-semibold text-white sm:w-auto"
          >
            Enregistrer le barème
          </button>
        </form>
      )}
    </StaffShell>
  );
}
