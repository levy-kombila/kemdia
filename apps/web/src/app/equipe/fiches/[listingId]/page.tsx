import { ExternalLink, Trash2 } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { StaffShell, StatusBadge } from "@/components/staff/StaffShell";
import { FormAlert } from "@/components/ui/Field";
import { getCategoryTree } from "@/lib/catalog";
import { formatDateTime, formatFCFA } from "@/lib/format";
import { first } from "@/lib/search-params";
import {
  closeCorrectionAction,
  mergeListingAction,
  removeListingImageAction,
  updateListingAction,
  withdrawOfferAction,
} from "@/lib/staff/actions";
import { PRODUCT_STATUS } from "@/lib/staff/labels";
import { staffErrorFromParam, staffErrorMessage, staffNotice } from "@/lib/staff/messages";
import { staffImageSrc } from "@/lib/staff/moderation-view";
import { requireVerifiedStaff, staffApi } from "@/lib/staff/staff";
import { categoryOptions } from "@/lib/vendor/categories";

export const metadata: Metadata = { title: "Fiche produit" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const inputClass =
  "border-ink-200 focus:border-brand-600 focus:ring-brand-100 w-full rounded-xl border bg-white px-3 py-2.5 text-base outline-none focus:ring-4";
const button =
  "bg-ink-900 hover:bg-ink-800 rounded-full px-5 py-2 text-sm font-semibold text-white";
const secondary =
  "border-ink-200 hover:bg-ink-50 inline-flex items-center gap-1.5 rounded-full border-2 bg-white px-4 py-2 text-sm font-semibold";

/**
 * Une fiche commune vue par l'équipe (S7.5-T03, ADR-0049) : correction (recopiée sur toutes les offres), photos,
 * offres des boutiques (retrait avec motif), propositions des vendeurs, fusion d'un doublon dans une autre fiche.
 */
export default async function StaffListingPage({
  params,
  searchParams,
}: {
  params: Promise<{ listingId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ listingId }, query] = await Promise.all([params, searchParams]);
  if (!UUID.test(listingId)) notFound();
  const page = `/equipe/fiches/${listingId}`;
  const { account, token } = await requireVerifiedStaff(page, "catalog");
  const fusion = first(query.fusion);
  const targetQuery = (first(query.cible) ?? "").slice(0, 100).trim();
  const [result, corrections, tree, target, candidates] = await Promise.all([
    staffApi().listing(token, listingId),
    staffApi().corrections(token, { status: "open", listingId }),
    getCategoryTree().catch(() => []),
    fusion && UUID.test(fusion) && fusion !== listingId
      ? staffApi().listing(token, fusion)
      : Promise.resolve(null),
    targetQuery.length >= 2
      ? staffApi().listings(token, { q: targetQuery, status: "published" })
      : Promise.resolve(null),
  ]);
  if (!result.ok && result.code === "FICHE_INTROUVABLE") notFound();
  const crumbs = [{ label: "Fiches produits", href: "/equipe/fiches" }, { label: "Fiche" }];
  const shell = (title: string, children: React.ReactNode) => (
    <StaffShell
      section="fiches"
      roles={account.roles}
      title={title}
      crumbs={crumbs}
      notice={staffNotice(first(query.ok))}
      error={staffErrorFromParam(first(query.erreur))}
    >
      {children}
    </StaffShell>
  );
  if (!result.ok) return shell("Fiche", <FormAlert>{staffErrorMessage(result.code)}</FormAlert>);

  const { listing, offers } = result.data;
  const merged = listing.mergedIntoId !== null;
  const hidden = <input type="hidden" name="listingId" value={listing.id} />;
  // Variantes vendues par les offres : celles qu'une fusion doit faire correspondre
  const soldVariants = listing.variants.filter((v) =>
    offers.some((o) => o.variants.some((ov) => ov.listingVariantId === v.id)),
  );

  return shell(
    listing.title,
    <>
      <section aria-label="État de la fiche" className="space-y-2 rounded-xl bg-white p-5">
        <p className="flex flex-wrap items-center gap-2">
          <StatusBadge tone={PRODUCT_STATUS[listing.status].tone}>
            {merged ? "Fusionnée" : PRODUCT_STATUS[listing.status].label}
          </StatusBadge>
          <span className="text-ink-500 text-sm">
            {listing.offerCount} offre(s) en ligne
            {listing.offerCount > 0 && ` · dès ${formatFCFA(listing.price)}`}
          </span>
        </p>
        {merged && listing.mergedIntoId && (
          <p className="text-sm">
            Doublon fusionné dans{" "}
            <Link
              href={`/equipe/fiches/${listing.mergedIntoId}`}
              className="text-brand-700 font-semibold underline"
            >
              cette fiche
            </Link>
            .
          </p>
        )}
        {listing.status === "published" && !merged && (
          <Link
            href={`/produit/${listing.slug}`}
            className="text-brand-700 inline-flex items-center gap-1 text-sm font-semibold underline"
          >
            Voir sur le site <ExternalLink className="size-4" aria-hidden />
          </Link>
        )}
      </section>

      {corrections.ok && corrections.data.items.length > 0 && (
        <section aria-labelledby="propositions" className="space-y-3 rounded-xl bg-white p-5">
          <h2 id="propositions" className="text-lg font-extrabold">
            Propositions des vendeurs ({corrections.data.items.length})
          </h2>
          <ul className="divide-ink-100 divide-y">
            {corrections.data.items.map((c) => (
              <li key={c.id} className="space-y-2 py-3">
                <p className="text-ink-500 text-sm">
                  {c.shop?.name ?? "Boutique inconnue"} · {formatDateTime(c.createdAt)}
                </p>
                <p className="bg-ink-50 whitespace-pre-line rounded-lg p-3 text-sm">{c.message}</p>
                <form action={closeCorrectionAction} className="flex flex-col gap-2 sm:flex-row">
                  <input type="hidden" name="correctionId" value={c.id} />
                  <input type="hidden" name="back" value={page} />
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
                  <button type="submit" className={secondary}>
                    Clore
                  </button>
                </form>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section aria-labelledby="photos" className="space-y-3 rounded-xl bg-white p-5">
        <h2 id="photos" className="text-lg font-extrabold">
          Photos ({listing.images.length})
        </h2>
        {listing.images.length === 0 ? (
          <p className="text-ink-500 text-sm">Aucune photo.</p>
        ) : (
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {listing.images.map((path, index) => {
              // Photos de vendeur : relais de l'équipe (même avant publication) ; photos du catalogue Kemdia : publiques
              const src = staffImageSrc(listing.id, path) ?? path;
              const imageId = /\/images\/v\/([0-9a-f-]{36})\.webp$/.exec(path)?.[1];
              return (
                <li key={path} className="space-y-2">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={src}
                    alt={`Photo ${index + 1}`}
                    loading="lazy"
                    className="border-ink-100 bg-ink-50 aspect-square w-full rounded-lg border object-contain"
                  />
                  {imageId && !merged && (
                    <details>
                      <summary className="text-brand-700 flex cursor-pointer items-center gap-1 text-sm font-semibold">
                        <Trash2 className="size-4" aria-hidden /> Retirer…
                        <span className="sr-only"> la photo {index + 1}</span>
                      </summary>
                      <form action={removeListingImageAction} className="mt-2">
                        {hidden}
                        <input type="hidden" name="imageId" value={imageId} />
                        <button type="submit" className={`${secondary} text-brand-700`}>
                          Retirer définitivement
                          <span className="sr-only"> la photo {index + 1}</span>
                        </button>
                      </form>
                    </details>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {!merged && (
        <details className="rounded-xl bg-white">
          <summary className="cursor-pointer px-5 py-4 text-lg font-extrabold">
            Corriger la fiche (recopiée sur toutes les offres)
          </summary>
          <form action={updateListingAction} className="space-y-4 px-5 pb-5">
            {hidden}
            <label className="block text-sm font-semibold">
              Titre
              <input
                name="title"
                defaultValue={listing.title}
                maxLength={120}
                className={`${inputClass} mt-1`}
              />
            </label>
            <label className="block text-sm font-semibold">
              Marque (vide : sans marque)
              <input
                name="brand"
                defaultValue={listing.brand ?? ""}
                maxLength={60}
                className={`${inputClass} mt-1`}
              />
            </label>
            {tree.length > 0 && (
              <label className="block text-sm font-semibold">
                Catégorie
                <select
                  name="categoryId"
                  defaultValue={listing.categoryId}
                  className={`${inputClass} mt-1`}
                >
                  {categoryOptions(tree).map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.group} › {c.label}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <label className="block text-sm font-semibold">
              Description
              <textarea
                name="description"
                defaultValue={listing.description}
                rows={6}
                maxLength={5000}
                className={`${inputClass} mt-1`}
              />
            </label>
            <fieldset className="space-y-2">
              <legend className="text-sm font-semibold">Déclinaisons</legend>
              {listing.variants.map((v) => (
                <div key={v.id}>
                  <input type="hidden" name="variantIds" value={v.id} />
                  <input type="hidden" name={`variant-before-${v.id}`} value={v.name} />
                  <label className="sr-only" htmlFor={`variant-${v.id}`}>
                    Nom de la déclinaison « {v.name} »
                  </label>
                  <input
                    id={`variant-${v.id}`}
                    name={`variant-${v.id}`}
                    defaultValue={v.name}
                    maxLength={80}
                    className={inputClass}
                  />
                </div>
              ))}
              <label className="block text-sm font-semibold">
                Nouvelle déclinaison (facultative)
                <input
                  name="newVariant"
                  maxLength={80}
                  placeholder="Ex. : Vert · 256 Go"
                  className={`${inputClass} mt-1`}
                />
              </label>
            </fieldset>
            <button type="submit" className={button}>
              Enregistrer la fiche
            </button>
          </form>
        </details>
      )}

      <section aria-labelledby="offres" className="space-y-3 rounded-xl bg-white p-5">
        <h2 id="offres" className="text-lg font-extrabold">
          Offres des boutiques ({offers.length})
        </h2>
        {offers.length === 0 ? (
          <p className="text-ink-500 text-sm">Aucune offre.</p>
        ) : (
          <ul className="divide-ink-100 divide-y">
            {offers.map((offer) => (
              <li key={offer.id} className="space-y-2 py-3">
                <p className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold">{offer.shop?.name ?? "Boutique inconnue"}</span>
                  <StatusBadge tone={PRODUCT_STATUS[offer.status].tone}>
                    {PRODUCT_STATUS[offer.status].label}
                  </StatusBadge>
                </p>
                <p className="text-ink-500 text-sm">
                  {offer.variants
                    .map(
                      (v) =>
                        `${v.name} : ${formatFCFA(v.price)} (stock ${v.stock}${v.isActive ? "" : ", hors vente"})`,
                    )
                    .join(" · ")}
                </p>
                {offer.moderationReason && (
                  <p className="text-sm">
                    <strong>Motif :</strong> {offer.moderationReason}
                  </p>
                )}
                {(offer.status === "published" || offer.status === "pending") && (
                  <details>
                    <summary className="text-brand-700 cursor-pointer text-sm font-semibold">
                      Retirer cette offre…
                    </summary>
                    <form action={withdrawOfferAction} className="mt-2 space-y-2">
                      {hidden}
                      <input type="hidden" name="productId" value={offer.id} />
                      <label className="block text-sm font-semibold">
                        Motif montré au vendeur (5 à 300 caractères)
                        <input
                          name="reason"
                          required
                          minLength={5}
                          maxLength={300}
                          className={`${inputClass} mt-1`}
                        />
                      </label>
                      <button type="submit" className={button}>
                        Retirer l&apos;offre
                      </button>
                    </form>
                  </details>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      {!merged && (
        <section aria-labelledby="fusion" className="space-y-3 rounded-xl bg-white p-5">
          <h2 id="fusion" className="text-lg font-extrabold">
            Fusionner ce doublon dans une autre fiche
          </h2>
          <p className="text-ink-500 text-sm">
            Ses offres passent sur la fiche choisie et son adresse y mène. Paniers et commandes ne
            changent pas.
          </p>
          <form method="get" className="flex flex-col gap-2 sm:flex-row" role="search">
            <label htmlFor="cible" className="sr-only">
              Chercher la fiche qui remplace ce doublon
            </label>
            <input
              id="cible"
              name="cible"
              defaultValue={targetQuery}
              maxLength={100}
              placeholder="Chercher la fiche qui le remplace…"
              className={inputClass}
            />
            <button type="submit" className={secondary}>
              Chercher
            </button>
          </form>
          {candidates?.ok && (
            <ul className="space-y-1">
              {candidates.data.items
                .filter((c) => c.id !== listing.id)
                .map((c) => (
                  <li key={c.id}>
                    <Link
                      href={`${page}?fusion=${c.id}#fusion`}
                      className="text-brand-700 text-sm font-semibold underline"
                    >
                      {c.title} ({c.offerCount} offre(s))
                    </Link>
                  </li>
                ))}
            </ul>
          )}
          {target && !target.ok && <FormAlert>{staffErrorMessage(target.code)}</FormAlert>}
          {target?.ok && (
            <form
              action={mergeListingAction}
              className="border-ink-200 space-y-3 rounded-xl border p-4"
            >
              {hidden}
              <input type="hidden" name="into" value={target.data.listing.id} />
              <p className="text-sm">
                Cible : <strong>{target.data.listing.title}</strong>
              </p>
              {soldVariants.map((v) => (
                <div key={v.id}>
                  <input type="hidden" name="sourceVariantIds" value={v.id} />
                  <label className="block text-sm font-semibold">
                    « {v.name} » devient
                    <select name={`map-${v.id}`} required className={`${inputClass} mt-1`}>
                      {target.data.listing.variants.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.name}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
              ))}
              <button type="submit" className={button}>
                Fusionner dans « {target.data.listing.title} »
              </button>
            </form>
          )}
        </section>
      )}
    </>,
  );
}
