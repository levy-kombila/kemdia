import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { FormAlert } from "@/components/ui/Field";
import { VendorShell } from "@/components/vendor/VendorShell";
import { formatFCFA } from "@/lib/format";
import { first } from "@/lib/search-params";
import { createOfferAction } from "@/lib/vendor/actions";
import { isUuid } from "@/lib/vendor/images";
import { vendorErrorFromParam, vendorErrorMessage } from "@/lib/vendor/messages";
import { requireActiveVendor, vendorApi } from "@/lib/vendor/vendor";

export const metadata: Metadata = { title: "Vendre ce produit" };

const inputClass =
  "border-ink-200 focus:border-brand-600 focus:ring-brand-100 w-full rounded-xl border bg-white px-3 py-2.5 text-base outline-none focus:ring-4";

/**
 * « Vendre ce produit » (S7.5-T03) : la boutique pose son offre (prix, stock) sur une fiche en ligne, déclinaison par
 * déclinaison. En ligne tout de suite (choix du 2026-10-20) : ni texte ni photo à modérer.
 */
export default async function SellListingPage({
  params,
  searchParams,
}: {
  params: Promise<{ listingId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ listingId }, query] = await Promise.all([params, searchParams]);
  if (!isUuid(listingId) || listingId !== listingId.toLowerCase()) notFound();
  const { token } = await requireActiveVendor(`/vendeur/fiches/${listingId}`);
  const result = await vendorApi().listing(token, listingId);
  if (!result.ok && result.code === "FICHE_INTROUVABLE") notFound();
  const crumbs = [
    { label: "Ajouter un produit", href: "/vendeur/produits/nouveau" },
    { label: "Vendre ce produit" },
  ];
  if (!result.ok)
    return (
      <VendorShell section="nouveau" menu title="Vendre ce produit" crumbs={crumbs}>
        <FormAlert>{vendorErrorMessage(result.code)}</FormAlert>
      </VendorShell>
    );
  const listing = result.data;
  if (listing.myOfferId) redirect(`/vendeur/produits/${listing.myOfferId}`);

  return (
    <VendorShell
      section="nouveau"
      menu
      title={listing.title}
      crumbs={crumbs}
      error={vendorErrorFromParam(first(query.erreur))}
    >
      <section className="flex items-center gap-4 rounded-xl bg-white p-5" aria-label="Le produit">
        {listing.image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={listing.image}
            alt=""
            className="bg-ink-50 size-20 shrink-0 rounded-lg object-contain"
          />
        ) : null}
        <div className="space-y-1 text-sm">
          <p className="text-ink-500">
            {listing.brand ? `${listing.brand} · ` : ""}
            {listing.offerCount} boutique(s) le vendent, dès {formatFCFA(listing.price)}
          </p>
          <Link
            href={`/produit/${listing.slug}`}
            className="text-brand-700 font-semibold underline"
          >
            Voir la fiche sur le site
          </Link>
        </div>
      </section>

      <form action={createOfferAction} className="space-y-4 rounded-xl bg-white p-5">
        <input type="hidden" name="listingId" value={listing.id} />
        <h2 className="text-lg font-extrabold">Votre prix et votre stock</h2>
        <p className="text-ink-500 text-sm">
          Cochez ce que vous vendez. Le titre, la description et les photos sont ceux de la fiche :
          une erreur ? Vous pourrez proposer une correction à l&apos;équipe Kemdia.
        </p>
        {listing.variants.map((variant, index) => (
          <fieldset key={variant.id} className="border-ink-200 space-y-3 rounded-xl border p-4">
            <input type="hidden" name="variantIds" value={variant.id} />
            <legend className="px-1 font-semibold">{variant.name}</legend>
            <label className="flex items-center gap-2 text-sm font-medium">
              <input
                type="checkbox"
                name={`sell-${variant.id}`}
                defaultChecked={index === 0}
                className="accent-brand-600 size-5"
              />
              Je vends « {variant.name} »
            </label>
            <div className="grid gap-3 sm:grid-cols-3">
              <label className="block text-sm font-semibold">
                Prix (FCFA)
                <input
                  name={`price-${variant.id}`}
                  inputMode="numeric"
                  maxLength={12}
                  className={`${inputClass} mt-1`}
                />
              </label>
              <label className="block text-sm font-semibold">
                Prix barré (facultatif)
                <input
                  name={`compareAtPrice-${variant.id}`}
                  inputMode="numeric"
                  maxLength={12}
                  className={`${inputClass} mt-1`}
                />
              </label>
              <label className="block text-sm font-semibold">
                Stock
                <input
                  name={`stock-${variant.id}`}
                  inputMode="numeric"
                  maxLength={8}
                  className={`${inputClass} mt-1`}
                />
              </label>
            </div>
          </fieldset>
        ))}
        <button
          type="submit"
          className="bg-brand-600 hover:bg-brand-700 rounded-full px-6 py-3 font-semibold text-white"
        >
          Mettre en vente
        </button>
        <p className="text-ink-500 text-sm">
          Votre offre est en ligne tout de suite ; l&apos;équipe Kemdia peut la retirer en cas de
          prix anormal.
        </p>
      </form>
    </VendorShell>
  );
}
