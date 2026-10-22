import { ChevronRight, Store } from "lucide-react";
import { SHOP_STATUSES, type ShopStatus } from "@kemdia/contracts/constants";
import type { Metadata } from "next";
import Link from "next/link";
import { StaffShell, StatusBadge } from "@/components/staff/StaffShell";
import { FormAlert } from "@/components/ui/Field";
import { formatDateTime } from "@/lib/format";
import { first } from "@/lib/search-params";
import { CURSOR, SHOP_STATUS } from "@/lib/staff/labels";
import { staffErrorMessage } from "@/lib/staff/messages";
import { requireVerifiedStaff, staffApi } from "@/lib/staff/staff";
import { cn } from "@/lib/cn";

export const metadata: Metadata = { title: "Boutiques" };

const PAGE_SIZE = 20;

/** Boutiques des vendeurs (S6-T01, administrateurs) : demandes à examiner d'abord, de la plus ancienne à la plus récente. */
export default async function ShopsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const status: ShopStatus = SHOP_STATUSES.find((s) => s === first(params.statut)) ?? "pending";
  const raw = first(params.apres);
  const after = raw && CURSOR.test(raw) ? raw : undefined;
  const { account, token } = await requireVerifiedStaff(
    status === "pending" ? "/equipe/boutiques" : `/equipe/boutiques?statut=${status}`,
    "catalog",
  );
  const result = await staffApi().shops(token, { status, after, limit: PAGE_SIZE });

  return (
    <StaffShell
      section="boutiques"
      roles={account.roles}
      title="Boutiques"
      crumbs={[{ label: "Boutiques" }]}
    >
      <nav aria-label="Statut des boutiques" className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
        <ul className="flex gap-2">
          {SHOP_STATUSES.map((s) => (
            <li key={s} className="shrink-0">
              <Link
                href={`/equipe/boutiques?statut=${s}`}
                aria-current={s === status ? "page" : undefined}
                className={cn(
                  "inline-flex rounded-full border-2 px-4 py-1.5 text-sm font-semibold",
                  s === status
                    ? "border-ink-900 bg-ink-900 text-white"
                    : "border-ink-200 hover:bg-ink-50 bg-white",
                )}
              >
                {SHOP_STATUS[s].tab}
              </Link>
            </li>
          ))}
        </ul>
      </nav>

      {!result.ok ? (
        <FormAlert>{staffErrorMessage(result.code)}</FormAlert>
      ) : result.data.items.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-xl bg-white px-6 py-12 text-center">
          <Store className="text-ink-400 size-10" aria-hidden />
          <p className="font-semibold">
            {after ? "Pas d'autre boutique." : "Aucune boutique dans cette liste."}
          </p>
        </div>
      ) : (
        <>
          <ul className="space-y-2">
            {result.data.items.map((shop) => (
              <li key={shop.id}>
                <Link
                  href={`/equipe/boutiques/${shop.id}`}
                  className="hover:ring-brand-100 flex items-center gap-3 rounded-xl bg-white p-4 transition hover:ring-4"
                >
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="truncate font-bold">{shop.name}</span>
                      <StatusBadge tone={SHOP_STATUS[shop.status].tone}>
                        {SHOP_STATUS[shop.status].label}
                      </StatusBadge>
                    </span>
                    <span className="text-ink-500 block text-sm">
                      {shop.city} · demande du {formatDateTime(shop.submittedAt)}
                    </span>
                  </span>
                  <ChevronRight className="text-ink-400 size-5 shrink-0" aria-hidden />
                </Link>
              </li>
            ))}
          </ul>
          {result.data.nextCursor && (
            <Link
              href={`/equipe/boutiques?statut=${status}&apres=${result.data.nextCursor}`}
              className="border-ink-200 hover:bg-ink-50 inline-flex rounded-full border-2 bg-white px-5 py-2.5 text-sm font-semibold"
            >
              Boutiques suivantes
            </Link>
          )}
        </>
      )}
    </StaffShell>
  );
}
