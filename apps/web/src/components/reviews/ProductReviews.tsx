import { BadgeCheck } from "lucide-react";
import Link from "next/link";
import { Rating } from "@/components/ui/Rating";
import { getCurrentAccount } from "@/lib/auth/session";
import { formatDate } from "@/lib/format";
import { sessionToken } from "@/lib/orders/orders";
import { reviewsApi } from "@/lib/reviews/reviews";
import { ReviewForm } from "./ReviewForm";

/**
 * Avis clients sur la fiche produit (S8-T01, ADR-0056) : moyenne, répartition des notes, avis publiés (10 par page,
 * « Achat vérifié »), et le formulaire pour un client dont une commande de ce produit est livrée.
 */
export async function ProductReviews({ slug, page }: { slug: string; page: number }) {
  const [reviews, current] = await Promise.all([
    reviewsApi().page(slug, page),
    getCurrentAccount(),
  ]);
  const token = current.status === "signed-in" ? await sessionToken() : null;
  const mine = token ? await reviewsApi().mine(token, slug) : null;

  if (!reviews.ok) {
    return <p className="text-ink-500">Les avis sont momentanément indisponibles.</p>;
  }
  const { summary, items, totalPages } = reviews.data;
  return (
    <div className="space-y-4">
      {summary.count > 0 ? (
        <div className="flex flex-wrap items-center gap-6">
          <div className="flex items-center gap-4">
            <p className="font-price text-5xl">{summary.average.toFixed(1).replace(".", ",")}</p>
            <div>
              <Rating value={summary.average} size="md" />
              <p className="text-ink-500 text-sm">
                Moyenne de {summary.count} avis d&apos;acheteur{summary.count > 1 ? "s" : ""}
              </p>
            </div>
          </div>
          <ul className="min-w-48 flex-1 space-y-1 text-sm" aria-label="Répartition des notes">
            {[5, 4, 3, 2, 1].map((stars) => {
              const n = summary.distribution[stars - 1] ?? 0;
              return (
                <li key={stars} className="flex items-center gap-2">
                  <span className="w-14 shrink-0">
                    {stars} étoile{stars > 1 ? "s" : ""}
                  </span>
                  <span className="bg-ink-100 h-2 flex-1 overflow-hidden rounded-full" aria-hidden>
                    <span
                      className="bg-accent-500 block h-full"
                      style={{ width: `${(n / summary.count) * 100}%` }}
                    />
                  </span>
                  <span className="text-ink-500 w-8 text-right">{n}</span>
                </li>
              );
            })}
          </ul>
        </div>
      ) : (
        <p className="text-ink-500">Aucun avis pour le moment.</p>
      )}

      {items.length > 0 && (
        <ul className="divide-ink-100 divide-y">
          {items.map((r, i) => (
            <li key={`${r.date}-${i}`} className="space-y-1 py-3">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
                <Rating value={r.rating} />
                <span className="font-semibold">{r.authorName}</span>
                <span className="text-forest-700 inline-flex items-center gap-1 text-xs font-semibold">
                  <BadgeCheck className="size-3.5" aria-hidden /> Achat vérifié
                </span>
                <span className="text-ink-500 text-xs">{formatDate(r.date)}</span>
              </div>
              {/* Texte du client affiché par React : échappé automatiquement */}
              {r.comment && <p className="text-ink-700 whitespace-pre-line text-sm">{r.comment}</p>}
            </li>
          ))}
        </ul>
      )}

      {totalPages > 1 && (
        <nav aria-label="Pages des avis" className="flex items-center gap-3 text-sm">
          {reviews.data.page > 1 && (
            <Link
              href={`?avis=${reviews.data.page - 1}#avis`}
              scroll={false}
              className="text-brand-700 underline"
            >
              Avis plus récents
            </Link>
          )}
          <span className="text-ink-500">
            Page {reviews.data.page} sur {totalPages}
          </span>
          {reviews.data.page < totalPages && (
            <Link
              href={`?avis=${reviews.data.page + 1}#avis`}
              scroll={false}
              className="text-brand-700 underline"
            >
              Avis plus anciens
            </Link>
          )}
        </nav>
      )}

      {current.status !== "signed-in" ? (
        <p className="text-ink-500 text-sm">
          Seuls les clients ayant reçu ce produit peuvent donner leur avis.{" "}
          <Link
            href={`/connexion?retour=${encodeURIComponent(`/produit/${slug}`)}`}
            className="text-brand-700 underline"
          >
            Se connecter
          </Link>
        </p>
      ) : mine?.ok && (mine.data.canReview || mine.data.review) ? (
        <ReviewForm slug={slug} mine={mine.data.review} />
      ) : (
        <p className="text-ink-500 text-sm">
          Vous pourrez donner votre avis sur ce produit une fois votre commande livrée.
        </p>
      )}
    </div>
  );
}
