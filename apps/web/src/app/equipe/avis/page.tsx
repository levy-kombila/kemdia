import { Star } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { StaffShell } from "@/components/staff/StaffShell";
import { FormAlert } from "@/components/ui/Field";
import { formatDateTime } from "@/lib/format";
import { first } from "@/lib/search-params";
import { publishReviewAction, rejectReviewAction } from "@/lib/staff/actions";
import { CURSOR } from "@/lib/staff/labels";
import { staffErrorFromParam, staffErrorMessage, staffNotice } from "@/lib/staff/messages";
import { requireVerifiedStaff, staffApi } from "@/lib/staff/staff";

export const metadata: Metadata = { title: "Avis clients" };

const inputClass =
  "border-ink-200 focus:border-brand-600 focus:ring-brand-100 w-full rounded-xl border bg-white px-3 py-2 text-sm outline-none focus:ring-4";

/**
 * Avis clients à lire (S8-T01, ADR-0056) : les avis avec un commentaire attendent l'équipe Catalogue avant d'être
 * publiés. Publier, ou refuser avec un motif montré à l'auteur. Les notes seules sont publiées sans attendre.
 */
export default async function ReviewsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const raw = first(params.apres);
  const after = raw && CURSOR.test(raw) ? raw : undefined;
  const { account, token } = await requireVerifiedStaff("/equipe/avis", "catalog");
  const queue = await staffApi().reviews(token, { status: "pending", after });

  return (
    <StaffShell
      section="avis"
      roles={account.roles}
      title="Avis clients"
      crumbs={[{ label: "Avis clients" }]}
      notice={staffNotice(first(params.ok))}
      error={staffErrorFromParam(first(params.erreur))}
    >
      <p className="text-ink-500 text-sm">
        Avis avec un commentaire, du plus ancien au plus récent. Publiez ce qui parle du produit ;
        refusez (avec un motif) les insultes, les données personnelles, la publicité ou le hors
        sujet.
      </p>
      {!queue.ok ? (
        <FormAlert>{staffErrorMessage(queue.code)}</FormAlert>
      ) : queue.data.items.length === 0 ? (
        <p className="text-ink-500 rounded-xl bg-white p-5 text-sm">Aucun avis en attente.</p>
      ) : (
        <ul className="space-y-3">
          {queue.data.items.map((r) => (
            <li key={r.id} className="space-y-3 rounded-xl bg-white p-5">
              <p className="text-sm">
                {r.listing ? (
                  <Link
                    href={`/produit/${r.listing.slug}`}
                    className="text-brand-700 font-semibold underline"
                  >
                    {r.listing.title}
                  </Link>
                ) : (
                  <span className="font-semibold">Fiche retirée</span>
                )}{" "}
                <span className="text-ink-500">
                  · {r.authorName} · {formatDateTime(r.date)}
                </span>
              </p>
              <p className="flex items-center gap-0.5" aria-label={`${r.rating} étoiles sur 5`}>
                {[1, 2, 3, 4, 5].map((n) => (
                  <Star
                    key={n}
                    aria-hidden
                    className={
                      n <= r.rating ? "size-4 fill-amber-400 text-amber-500" : "text-ink-300 size-4"
                    }
                  />
                ))}
              </p>
              {/* Texte du client affiché par React : échappé automatiquement */}
              <p className="bg-ink-50 whitespace-pre-line rounded-lg p-3 text-sm">{r.comment}</p>
              <div className="flex flex-wrap items-start gap-3">
                <form action={publishReviewAction}>
                  <input type="hidden" name="reviewId" value={r.id} />
                  <button
                    type="submit"
                    className="bg-brand-600 hover:bg-brand-700 rounded-full px-4 py-2 text-sm font-semibold text-white"
                  >
                    Publier
                  </button>
                </form>
                <form action={rejectReviewAction} className="flex min-w-64 flex-1 flex-wrap gap-2">
                  <input type="hidden" name="reviewId" value={r.id} />
                  <label className="sr-only" htmlFor={`motif-${r.id}`}>
                    Motif du refus
                  </label>
                  <input
                    id={`motif-${r.id}`}
                    name="reason"
                    required
                    minLength={5}
                    maxLength={300}
                    placeholder="Motif montré au client (5 à 300 caractères)"
                    className={inputClass + " min-w-48 flex-1"}
                  />
                  <button
                    type="submit"
                    className="border-ink-300 hover:bg-ink-50 rounded-full border px-4 py-2 text-sm font-semibold"
                  >
                    Refuser
                  </button>
                </form>
              </div>
            </li>
          ))}
        </ul>
      )}
      {queue.ok && queue.data.nextCursor && (
        <Link
          href={`/equipe/avis?apres=${queue.data.nextCursor}`}
          className="text-brand-700 text-sm font-semibold underline"
        >
          Avis suivants
        </Link>
      )}
    </StaffShell>
  );
}
