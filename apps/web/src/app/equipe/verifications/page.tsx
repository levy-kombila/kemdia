import { ChevronRight, IdCard } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { StaffShell, StatusBadge } from "@/components/staff/StaffShell";
import { FormAlert } from "@/components/ui/Field";
import { cn } from "@/lib/cn";
import { formatDateTime } from "@/lib/format";
import { first } from "@/lib/search-params";
import { CURSOR, KYC_STATUS, KYC_TABS } from "@/lib/staff/labels";
import { staffErrorMessage } from "@/lib/staff/messages";
import { requireVerifiedStaff, staffApi } from "@/lib/staff/staff";

export const metadata: Metadata = { title: "Vérifications des vendeurs" };

const PAGE_SIZE = 20;

/** Dossiers de vérification (S6-T08, administrateurs) : à vérifier d'abord, du plus ancien envoi au plus récent. */
export default async function KycQueuePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const status = KYC_TABS.find((s) => s === first(params.statut)) ?? "pending";
  const raw = first(params.apres);
  const after = raw && CURSOR.test(raw) ? raw : undefined;
  const { token } = await requireVerifiedStaff(
    status === "pending" ? "/equipe/verifications" : `/equipe/verifications?statut=${status}`,
    "admin",
  );
  const result = await staffApi().kycList(token, { status, after, limit: PAGE_SIZE });

  return (
    <StaffShell
      section="verifications"
      admin
      title="Vérifications des vendeurs"
      crumbs={[{ label: "Vérifications" }]}
    >
      <nav aria-label="Statut des dossiers" className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
        <ul className="flex gap-2">
          {KYC_TABS.map((s) => (
            <li key={s} className="shrink-0">
              <Link
                href={`/equipe/verifications?statut=${s}`}
                aria-current={s === status ? "page" : undefined}
                className={cn(
                  "inline-flex rounded-full border-2 px-4 py-1.5 text-sm font-semibold",
                  s === status
                    ? "border-ink-900 bg-ink-900 text-white"
                    : "border-ink-200 hover:bg-ink-50 bg-white",
                )}
              >
                {KYC_STATUS[s].tab}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
      {!result.ok ? (
        <FormAlert>{staffErrorMessage(result.code)}</FormAlert>
      ) : result.data.items.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-xl bg-white px-6 py-12 text-center">
          <IdCard className="text-ink-400 size-10" aria-hidden />
          <p className="font-semibold">
            {after ? "Pas d'autre dossier." : "Aucun dossier dans cette liste."}
          </p>
        </div>
      ) : (
        <>
          <ul className="space-y-2">
            {result.data.items.map((item) => (
              <li key={item.shopId}>
                <Link
                  href={`/equipe/verifications/${item.shopId}`}
                  className="hover:ring-brand-100 flex items-center gap-3 rounded-xl bg-white p-4 transition hover:ring-4"
                >
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="truncate font-bold">{item.shopName}</span>
                      <StatusBadge tone={KYC_STATUS[item.status].tone}>
                        {KYC_STATUS[item.status].label}
                      </StatusBadge>
                    </span>
                    <span className="text-ink-500 block text-sm">
                      {item.holderKind === "company" ? "Entreprise" : "Personne seule"}
                      {item.submittedAt && ` · envoyé le ${formatDateTime(item.submittedAt)}`}
                    </span>
                  </span>
                  <ChevronRight className="text-ink-400 size-5 shrink-0" aria-hidden />
                </Link>
              </li>
            ))}
          </ul>
          {result.data.nextCursor && (
            <Link
              href={`/equipe/verifications?statut=${status}&apres=${result.data.nextCursor}`}
              className="border-ink-200 hover:bg-ink-50 inline-flex rounded-full border-2 bg-white px-5 py-2.5 text-sm font-semibold"
            >
              Dossiers suivants
            </Link>
          )}
        </>
      )}
    </StaffShell>
  );
}
