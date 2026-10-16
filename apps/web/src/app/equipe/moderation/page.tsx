import { ChevronRight, ImageOff, Tags } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { StaffShell, StatusBadge } from "@/components/staff/StaffShell";
import { FormAlert } from "@/components/ui/Field";
import { cn } from "@/lib/cn";
import { formatDateTime, formatFCFA } from "@/lib/format";
import { first } from "@/lib/search-params";
import { CURSOR, MODERATION_TABS, PRODUCT_STATUS, type ModerationTab } from "@/lib/staff/labels";
import { staffErrorMessage, staffNotice } from "@/lib/staff/messages";
import { staffImageSrc } from "@/lib/staff/moderation-view";
import { isAdmin } from "@/lib/staff/roles";
import { requireVerifiedStaff, staffApi } from "@/lib/staff/staff";

export const metadata: Metadata = { title: "Modération" };

const PAGE_SIZE = 20;

/** File de modération des produits des vendeurs (S6-T02, BR-003) : la demande la plus ancienne d'abord. */
export default async function ModerationPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const status: ModerationTab =
    MODERATION_TABS.find((t) => t.status === first(params.statut))?.status ?? "pending";
  const raw = first(params.apres);
  const after = raw && CURSOR.test(raw) ? raw : undefined;
  const { account, token } = await requireVerifiedStaff(
    status === "pending" ? "/equipe/moderation" : `/equipe/moderation?statut=${status}`,
  );
  const result = await staffApi().moderationQueue(token, { status, after, limit: PAGE_SIZE });

  return (
    <StaffShell
      section="moderation"
      admin={isAdmin(account.roles)}
      title="Modération des produits"
      crumbs={[{ label: "Modération" }]}
      notice={staffNotice(first(params.ok))}
    >
      <nav aria-label="Statut des produits" className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
        <ul className="flex gap-2">
          {MODERATION_TABS.map((tab) => (
            <li key={tab.status} className="shrink-0">
              <Link
                href={`/equipe/moderation?statut=${tab.status}`}
                aria-current={tab.status === status ? "page" : undefined}
                className={cn(
                  "inline-flex rounded-full border-2 px-4 py-1.5 text-sm font-semibold",
                  tab.status === status
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
        <FormAlert>{staffErrorMessage(result.code)}</FormAlert>
      ) : result.data.items.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-xl bg-white px-6 py-12 text-center">
          <Tags className="text-ink-400 size-10" aria-hidden />
          <p className="font-semibold">
            {status === "pending" && !after
              ? "Rien à modérer pour le moment."
              : "Aucun produit dans cette liste."}
          </p>
        </div>
      ) : (
        <>
          <ul className="space-y-2">
            {result.data.items.map((product) => {
              const cover = product.images[0] ? staffImageSrc(product.id, product.images[0]) : null;
              const prices = product.variants.map((v) => v.price);
              return (
                <li key={product.id}>
                  <Link
                    href={`/equipe/moderation/${product.id}`}
                    className="hover:ring-brand-100 flex items-center gap-3 rounded-xl bg-white p-3 transition hover:ring-4"
                  >
                    <span className="border-ink-100 bg-ink-50 flex size-16 shrink-0 items-center justify-center overflow-hidden rounded-lg border">
                      {cover ? (
                        // Photo pas encore validée : relais de l'équipe, jamais l'optimiseur de Next.js (ADR-0035)
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={cover} alt="" loading="lazy" className="size-full object-cover" />
                      ) : (
                        <ImageOff className="text-ink-400 size-6" aria-label="Sans photo" />
                      )}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-center gap-2">
                        <span className="truncate font-bold">{product.title}</span>
                        <StatusBadge tone={PRODUCT_STATUS[product.status].tone}>
                          {PRODUCT_STATUS[product.status].label}
                        </StatusBadge>
                      </span>
                      <span className="text-ink-500 block truncate text-sm">
                        {product.shop?.name ?? "Boutique inconnue"}
                        {prices.length > 0 && ` · dès ${formatFCFA(Math.min(...prices))}`}
                      </span>
                      {product.submittedAt && (
                        <span className="text-ink-500 block text-xs">
                          Envoyé le {formatDateTime(product.submittedAt)}
                        </span>
                      )}
                    </span>
                    <ChevronRight className="text-ink-400 size-5 shrink-0" aria-hidden />
                  </Link>
                </li>
              );
            })}
          </ul>
          {result.data.nextCursor && (
            <Link
              href={`/equipe/moderation?statut=${status}&apres=${result.data.nextCursor}`}
              className="border-ink-200 hover:bg-ink-50 inline-flex rounded-full border-2 bg-white px-5 py-2.5 text-sm font-semibold"
            >
              Produits suivants
            </Link>
          )}
        </>
      )}
    </StaffShell>
  );
}
