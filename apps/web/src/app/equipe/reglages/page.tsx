import { ZONES } from "@kemdia/contracts/delivery";
import type { Metadata } from "next";
import { StaffShell } from "@/components/staff/StaffShell";
import { FormAlert } from "@/components/ui/Field";
import { formatDateTime } from "@/lib/format";
import { first } from "@/lib/search-params";
import { saveBillingSettingsAction, saveCodSettingsAction } from "@/lib/staff/actions";
import { staffErrorFromParam, staffErrorMessage, staffNotice } from "@/lib/staff/messages";
import { requireVerifiedStaff, staffApi } from "@/lib/staff/staff";

export const metadata: Metadata = { title: "Réglages" };

const INPUT =
  "border-ink-200 focus:border-brand-600 h-10 w-full rounded-xl border bg-white px-3 outline-none";
const LABEL = "text-ink-800 mb-1 block text-sm font-semibold";
const BUTTON = "bg-brand-600 rounded-full px-5 py-2.5 font-semibold text-white hover:opacity-90";

const BILLING = [
  { name: "legalName", label: "Raison sociale", max: 120 },
  { name: "address", label: "Adresse", max: 200 },
  { name: "city", label: "Ville", max: 60 },
  { name: "phone", label: "Téléphone", max: 30 },
  { name: "email", label: "Adresse e-mail", max: 120, type: "email" },
  { name: "taxId", label: "NIF", max: 40 },
  { name: "tradeRegister", label: "RCCM", max: 40 },
  { name: "vatMention", label: "Mention de TVA imprimée", max: 120 },
] as const;

/**
 * Réglages de la Finance (S7.5-T05, ADR-0052) : informations de l'entreprise imprimées sur les factures (copiées et
 * figées dans chaque NOUVELLE facture) et paiement à la livraison (zones, total maximum). Chaque changement au journal.
 */
export default async function FinanceSettingsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const { account, token } = await requireVerifiedStaff("/equipe/reglages", "finance");
  const api = staffApi();
  const [billing, cod] = await Promise.all([api.billingSettings(token), api.codSettings(token)]);

  return (
    <StaffShell
      section="reglages"
      roles={account.roles}
      title="Réglages"
      crumbs={[{ label: "Réglages" }]}
      notice={staffNotice(first(params.ok))}
      error={staffErrorFromParam(first(params.erreur))}
    >
      <section className="space-y-3 rounded-xl bg-white p-5">
        <h2 className="text-lg font-bold">Facturation</h2>
        <p className="text-ink-500 text-sm">
          Imprimées sur les prochaines factures ; une facture déjà émise ne change jamais.
          {billing.ok && billing.data.updatedAt
            ? ` Dernière modification le ${formatDateTime(billing.data.updatedAt)}.`
            : " Jamais renseignées : en production, aucune facture n'est établie avant."}
        </p>
        {!billing.ok ? (
          <FormAlert>{staffErrorMessage(billing.code)}</FormAlert>
        ) : (
          <form action={saveBillingSettingsAction} className="grid gap-3 sm:grid-cols-2">
            {BILLING.map((f) => (
              <label key={f.name} className="block">
                <span className={LABEL}>{f.label}</span>
                <input
                  name={f.name}
                  type={"type" in f ? f.type : "text"}
                  required
                  maxLength={f.max}
                  defaultValue={billing.data[f.name]}
                  className={INPUT}
                />
              </label>
            ))}
            <div className="sm:col-span-2">
              <button type="submit" className={BUTTON}>
                Enregistrer la facturation
              </button>
            </div>
          </form>
        )}
      </section>

      <section className="space-y-3 rounded-xl bg-white p-5">
        <h2 className="text-lg font-bold">Paiement à la livraison</h2>
        {!cod.ok ? (
          <FormAlert>{staffErrorMessage(cod.code)}</FormAlert>
        ) : (
          <form action={saveCodSettingsAction} className="space-y-3">
            <fieldset>
              <legend className={LABEL}>Zones où il est proposé</legend>
              <div className="grid gap-2 sm:grid-cols-2">
                {(["zone_1", "zone_2", "zone_3", "zone_4"] as const).map((zone) => (
                  <label key={zone} className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      name="zones"
                      value={zone}
                      defaultChecked={cod.data.zones.includes(zone)}
                      className="size-4"
                    />
                    {ZONES[zone].label}
                  </label>
                ))}
              </div>
            </fieldset>
            <label className="block max-w-xs">
              <span className={LABEL}>Total maximum, livraison comprise (FCFA)</span>
              <input
                name="maxTotal"
                required
                inputMode="numeric"
                defaultValue={cod.data.maxTotal}
                className={INPUT}
              />
            </label>
            <button type="submit" className={BUTTON}>
              Enregistrer le paiement à la livraison
            </button>
          </form>
        )}
      </section>
    </StaffShell>
  );
}
