import { COUPON_CURSOR_PATTERN, type Coupon } from "@kemdia/contracts";
import { COUPON_PERCENT_MAX } from "@kemdia/contracts/constants";
import { BadgePercent, Plus } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { StaffShell, StatusBadge } from "@/components/staff/StaffShell";
import { FormAlert } from "@/components/ui/Field";
import { formatDate, formatFCFA } from "@/lib/format";
import { first } from "@/lib/search-params";
import { createCouponAction, setCouponActiveAction } from "@/lib/staff/actions";
import { staffErrorFromParam, staffErrorMessage, staffNotice } from "@/lib/staff/messages";
import { requireVerifiedStaff, staffApi } from "@/lib/staff/staff";

export const metadata: Metadata = { title: "Codes promo" };

const INPUT =
  "border-ink-200 focus:border-brand-600 h-10 w-full rounded-xl border bg-white px-3 outline-none";
const LABEL = "text-ink-800 mb-1 block text-xs font-semibold";

function describe(coupon: Coupon): string {
  const value =
    coupon.kind === "percent"
      ? `${coupon.value} %${coupon.maxDiscount ? ` (au plus ${formatFCFA(coupon.maxDiscount)})` : ""}`
      : formatFCFA(coupon.value);
  const parts = [`−${value}`];
  if (coupon.minSubtotal) parts.push(`dès ${formatFCFA(coupon.minSubtotal)} d'articles`);
  if (coupon.startsAt) parts.push(`du ${formatDate(coupon.startsAt)}`);
  if (coupon.endsAt) parts.push(`jusqu'au ${formatDate(coupon.endsAt)}`);
  parts.push(
    `${coupon.usedCount} utilisation${coupon.usedCount > 1 ? "s" : ""}${coupon.usageLimit ? ` sur ${coupon.usageLimit}` : ""}`,
  );
  if (coupon.perAccountLimit) parts.push(`${coupon.perAccountLimit} par compte`);
  if (coupon.stackableWithSales) parts.push("cumulable avec les prix barrés");
  return parts.join(" · ");
}

/** Codes promo (S7.5-T05, ADR-0052 ; règles BR-031), Finance : créer, activer, désactiver. Les règles d'un code ne changent plus. */
export default async function CouponsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const cursor = first(params.avant);
  const before = cursor && COUPON_CURSOR_PATTERN.test(cursor) ? cursor : undefined;
  const { account, token } = await requireVerifiedStaff("/equipe/codes-promo", "finance");
  const result = await staffApi().coupons(token, before);

  return (
    <StaffShell
      section="codes-promo"
      roles={account.roles}
      title="Codes promo"
      crumbs={[{ label: "Codes promo" }]}
      notice={staffNotice(first(params.ok))}
      error={staffErrorFromParam(first(params.erreur))}
    >
      <details className="border-ink-200 rounded-xl border-2 bg-white">
        <summary className="text-brand-700 flex cursor-pointer items-center gap-2 px-5 py-3 font-semibold">
          <Plus className="size-5" aria-hidden /> Nouveau code promo…
        </summary>
        <form action={createCouponAction} className="grid gap-3 px-5 pb-5 sm:grid-cols-2">
          <label className="block">
            <span className={LABEL}>Code (4 à 20 lettres, chiffres ou tirets)</span>
            <input
              name="code"
              required
              minLength={4}
              maxLength={20}
              className={`${INPUT} uppercase`}
            />
          </label>
          <fieldset>
            <legend className={LABEL}>Type de réduction</legend>
            <div className="flex gap-4 pt-2 text-sm">
              <label className="flex items-center gap-1">
                <input type="radio" name="kind" value="percent" defaultChecked /> Pourcentage
              </label>
              <label className="flex items-center gap-1">
                <input type="radio" name="kind" value="fixed" /> Montant fixe
              </label>
            </div>
          </fieldset>
          <label className="block">
            <span className={LABEL}>Valeur (1 à {COUPON_PERCENT_MAX} %, ou montant en FCFA)</span>
            <input name="value" required inputMode="numeric" className={INPUT} />
          </label>
          <label className="block">
            <span className={LABEL}>Plafond de la réduction en FCFA (pourcentage, facultatif)</span>
            <input name="maxDiscount" inputMode="numeric" className={INPUT} />
          </label>
          <label className="block">
            <span className={LABEL}>
              Minimum d&apos;articles en FCFA (obligatoire pour un montant fixe)
            </span>
            <input name="minSubtotal" inputMode="numeric" className={INPUT} />
          </label>
          <label className="block">
            <span className={LABEL}>Utilisations au total (vide : sans limite)</span>
            <input name="usageLimit" inputMode="numeric" className={INPUT} />
          </label>
          <label className="block">
            <span className={LABEL}>Utilisations par compte (vide : sans limite)</span>
            <input name="perAccountLimit" inputMode="numeric" defaultValue="1" className={INPUT} />
          </label>
          <label className="block">
            <span className={LABEL}>Valable à partir du (vide : tout de suite)</span>
            <input name="startsAt" type="date" className={INPUT} />
          </label>
          <label className="block">
            <span className={LABEL}>Valable jusqu&apos;au (inclus ; vide : sans fin)</span>
            <input name="endsAt" type="date" className={INPUT} />
          </label>
          <label className="text-ink-700 flex items-center gap-2 text-sm sm:col-span-2">
            <input type="checkbox" name="stackableWithSales" value="oui" className="size-4" /> Aussi
            sur les articles déjà en promotion (prix barré)
          </label>
          <div className="sm:col-span-2">
            <button
              type="submit"
              className="bg-brand-600 rounded-full px-5 py-2.5 font-semibold text-white hover:opacity-90"
            >
              Créer le code
            </button>
          </div>
        </form>
      </details>

      {!result.ok ? (
        <FormAlert>{staffErrorMessage(result.code)}</FormAlert>
      ) : result.data.items.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-xl bg-white px-6 py-12 text-center">
          <BadgePercent className="text-ink-400 size-10" aria-hidden />
          <p className="font-semibold">{before ? "Pas d'autre code." : "Aucun code promo."}</p>
        </div>
      ) : (
        <>
          <ul className="space-y-2">
            {result.data.items.map((coupon) => (
              <li
                key={coupon.id}
                className="flex flex-col gap-3 rounded-xl bg-white p-4 sm:flex-row sm:items-center"
              >
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-2">
                    <span className="font-mono font-bold">{coupon.code}</span>
                    <StatusBadge tone={coupon.active ? "ok" : "off"}>
                      {coupon.active ? "Actif" : "Désactivé"}
                    </StatusBadge>
                  </p>
                  <p className="text-ink-500 text-sm">{describe(coupon)}</p>
                </div>
                <form action={setCouponActiveAction}>
                  <input type="hidden" name="couponId" value={coupon.id} />
                  <input type="hidden" name="active" value={coupon.active ? "0" : "1"} />
                  <button
                    type="submit"
                    className="border-ink-200 hover:bg-ink-50 rounded-full border-2 px-4 py-1.5 text-sm font-semibold"
                  >
                    {coupon.active ? "Désactiver" : "Activer"}
                  </button>
                </form>
              </li>
            ))}
          </ul>
          {result.data.nextCursor && (
            <Link
              href={`/equipe/codes-promo?avant=${result.data.nextCursor}`}
              className="border-ink-200 hover:bg-ink-50 inline-flex rounded-full border-2 bg-white px-5 py-2.5 text-sm font-semibold"
            >
              Codes plus anciens
            </Link>
          )}
        </>
      )}
    </StaffShell>
  );
}
