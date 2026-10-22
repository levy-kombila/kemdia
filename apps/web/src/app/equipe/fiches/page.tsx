import { ChevronRight, Layers, Search } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { StaffShell, StatusBadge } from "@/components/staff/StaffShell";
import { FormAlert } from "@/components/ui/Field";
import { formatDateTime, formatFCFA } from "@/lib/format";
import { first } from "@/lib/search-params";
import { closeCorrectionAction } from "@/lib/staff/actions";
import { CURSOR, PRODUCT_STATUS } from "@/lib/staff/labels";
import { staffErrorFromParam, staffErrorMessage, staffNotice } from "@/lib/staff/messages";
import { requireVerifiedStaff, staffApi } from "@/lib/staff/staff";

export const metadata: Metadata = { title: "Fiches produits" };

const inputClass =
  "border-ink-200 focus:border-brand-600 focus:ring-brand-100 w-full rounded-xl border bg-white px-3 py-2.5 text-base outline-none focus:ring-4";

/**
 * Fiches communes (S7.5-T03) : propositions de correction des vendeurs à traiter, puis recherche dans toutes les
 * fiches (corriger, fusionner un doublon, retirer une offre).
 */
export default async function ListingsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const q = (first(params.q) ?? "").slice(0, 100).trim();
  const raw = first(params.apres);
  const after = raw && CURSOR.test(raw) ? raw : undefined;
  const { account, token } = await requireVerifiedStaff("/equipe/fiches", "catalog");
  const [corrections, listings] = await Promise.all([
    staffApi().corrections(token, { status: "open" }),
    staffApi().listings(token, { q, after }),
  ]);

  return (
    <StaffShell
      section="fiches"
      roles={account.roles}
      title="Fiches produits"
      crumbs={[{ label: "Fiches produits" }]}
      notice={staffNotice(first(params.ok))}
      error={staffErrorFromParam(first(params.erreur))}
    >
      <section aria-labelledby="propositions" className="space-y-3 rounded-xl bg-white p-5">
        <h2 id="propositions" className="text-lg font-extrabold">
          Propositions de correction des vendeurs
        </h2>
        {!corrections.ok ? (
          <FormAlert>{staffErrorMessage(corrections.code)}</FormAlert>
        ) : corrections.data.items.length === 0 ? (
          <p className="text-ink-500 text-sm">Aucune proposition en attente.</p>
        ) : (
          <ul className="divide-ink-100 divide-y">
            {corrections.data.items.map((c) => (
              <li key={c.id} className="space-y-2 py-3">
                <p className="text-sm">
                  <Link
                    href={`/equipe/fiches/${c.listing.id}`}
                    className="text-brand-700 font-semibold underline"
                  >
                    {c.listing.title}
                  </Link>{" "}
                  <span className="text-ink-500">
                    · {c.shop?.name ?? "Boutique inconnue"} · {formatDateTime(c.createdAt)}
                  </span>
                </p>
                <p className="bg-ink-50 whitespace-pre-line rounded-lg p-3 text-sm">{c.message}</p>
                <form action={closeCorrectionAction} className="flex flex-col gap-2 sm:flex-row">
                  <input type="hidden" name="correctionId" value={c.id} />
                  <input type="hidden" name="back" value="/equipe/fiches" />
                  <label className="sr-only" htmlFor={`note-${c.id}`}>
                    Réponse au vendeur (facultative)
                  </label>
                  <input
                    id={`note-${c.id}`}
                    name="note"
                    maxLength={300}
                    placeholder="Réponse au vendeur (facultative)"
                    className={inputClass}
                  />
                  <button
                    type="submit"
                    className="border-ink-200 hover:bg-ink-50 shrink-0 rounded-full border-2 px-4 py-2 text-sm font-semibold"
                  >
                    Clore
                  </button>
                </form>
              </li>
            ))}
          </ul>
        )}
      </section>

      <form method="get" role="search" className="flex flex-col gap-2 sm:flex-row">
        <label htmlFor="q" className="sr-only">
          Chercher une fiche
        </label>
        <input
          id="q"
          name="q"
          defaultValue={q}
          maxLength={100}
          placeholder="Titre, marque, catégorie…"
          className={inputClass}
        />
        <button
          type="submit"
          className="bg-ink-900 hover:bg-ink-800 inline-flex items-center justify-center gap-2 rounded-full px-5 py-2.5 font-semibold text-white"
        >
          <Search className="size-4" aria-hidden /> Chercher
        </button>
      </form>

      {!listings.ok ? (
        <FormAlert>{staffErrorMessage(listings.code)}</FormAlert>
      ) : listings.data.items.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-xl bg-white px-6 py-12 text-center">
          <Layers className="text-ink-400 size-10" aria-hidden />
          <p className="font-semibold">Aucune fiche.</p>
        </div>
      ) : (
        <>
          <ul className="space-y-2">
            {listings.data.items.map((listing) => (
              <li key={listing.id}>
                <Link
                  href={`/equipe/fiches/${listing.id}`}
                  className="hover:ring-brand-100 flex items-center gap-3 rounded-xl bg-white p-3 transition hover:ring-4"
                >
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="truncate font-bold">{listing.title}</span>
                      <StatusBadge tone={PRODUCT_STATUS[listing.status].tone}>
                        {listing.mergedIntoId ? "Fusionnée" : PRODUCT_STATUS[listing.status].label}
                      </StatusBadge>
                    </span>
                    <span className="text-ink-500 block text-sm">
                      {listing.brand ? `${listing.brand} · ` : ""}
                      {listing.offerCount} offre(s) en ligne
                      {listing.offerCount > 0 && ` · dès ${formatFCFA(listing.price)}`}
                    </span>
                  </span>
                  <ChevronRight className="text-ink-400 size-5 shrink-0" aria-hidden />
                </Link>
              </li>
            ))}
          </ul>
          {listings.data.nextCursor && (
            <Link
              href={`/equipe/fiches?${new URLSearchParams({ ...(q ? { q } : {}), apres: listings.data.nextCursor }).toString()}`}
              className="border-ink-200 hover:bg-ink-50 inline-flex rounded-full border-2 bg-white px-5 py-2.5 text-sm font-semibold"
            >
              Fiches suivantes
            </Link>
          )}
        </>
      )}
    </StaffShell>
  );
}
