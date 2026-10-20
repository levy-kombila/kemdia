import { PackagePlus, Search } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { FormAlert } from "@/components/ui/Field";
import { ProductForm } from "@/components/vendor/ProductForm";
import { VendorShell } from "@/components/vendor/VendorShell";
import { getCategoryTree } from "@/lib/catalog";
import { formatFCFA } from "@/lib/format";
import { first } from "@/lib/search-params";
import { categoryOptions } from "@/lib/vendor/categories";
import { vendorErrorMessage } from "@/lib/vendor/messages";
import { requireActiveVendor, vendorApi } from "@/lib/vendor/vendor";

export const metadata: Metadata = { title: "Ajouter un produit" };

const inputClass =
  "border-ink-200 focus:border-brand-600 focus:ring-brand-100 w-full rounded-xl border bg-white px-3 py-2.5 text-base outline-none focus:ring-4";

/**
 * Ajouter un produit (S7.5-T03, choix du 2026-10-20) : d'abord chercher s'il existe déjà sur Kemdia (une seule fiche
 * par produit : on y pose son offre), sinon créer une nouvelle fiche, photos d'abord. Formulaire de recherche en GET :
 * marche sans JavaScript, l'adresse se partage.
 */
export default async function NewProductPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const query = await searchParams;
  const { token } = await requireActiveVendor("/vendeur/produits/nouveau");
  const q = (first(query.q) ?? "").slice(0, 100).trim();
  const creating = first(query.creer) === "1";
  const [tree, found] = await Promise.all([
    creating ? getCategoryTree().catch(() => []) : Promise.resolve([]),
    q.length >= 2 ? vendorApi().searchListings(token, q) : Promise.resolve(null),
  ]);

  return (
    <VendorShell
      section="nouveau"
      menu
      title="Ajouter un produit"
      crumbs={[{ label: "Mes produits", href: "/vendeur/produits" }, { label: "Nouveau" }]}
    >
      {!creating && (
        <section aria-labelledby="chercher" className="space-y-4 rounded-xl bg-white p-6">
          <h2 id="chercher" className="text-lg font-extrabold">
            1. Ce produit existe-t-il déjà sur Kemdia ?
          </h2>
          <p className="text-ink-500 text-sm">
            Un même produit n&apos;a qu&apos;une fiche : s&apos;il existe, posez-y votre prix et
            votre stock, il est en vente tout de suite.
          </p>
          <form method="get" className="flex flex-col gap-2 sm:flex-row" role="search">
            <label htmlFor="q" className="sr-only">
              Nom du produit
            </label>
            <input
              id="q"
              name="q"
              defaultValue={q}
              minLength={2}
              maxLength={100}
              placeholder="Ex. : iPhone 15, pagne wax 6 yards…"
              className={inputClass}
            />
            <button
              type="submit"
              className="bg-ink-900 hover:bg-ink-800 inline-flex items-center justify-center gap-2 rounded-full px-5 py-2.5 font-semibold text-white"
            >
              <Search className="size-4" aria-hidden /> Chercher
            </button>
          </form>

          {found && !found.ok && <FormAlert>{vendorErrorMessage(found.code)}</FormAlert>}
          {found?.ok && found.data.items.length === 0 && (
            <p className="text-ink-700 text-sm" role="status">
              Aucun produit trouvé pour « {q} ».
            </p>
          )}
          {found?.ok && found.data.items.length > 0 && (
            <ul className="divide-ink-100 divide-y" aria-label="Produits trouvés">
              {found.data.items.map((listing) => (
                <li key={listing.id} className="flex items-center gap-3 py-3">
                  {listing.image ? (
                    // Photo d'une fiche en ligne : servie par le relais public (jamais l'optimiseur, ADR-0035)
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={listing.image}
                      alt=""
                      className="bg-ink-50 size-14 shrink-0 rounded-lg object-contain"
                    />
                  ) : (
                    <span className="bg-ink-50 size-14 shrink-0 rounded-lg" aria-hidden />
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold">{listing.title}</p>
                    <p className="text-ink-500 text-sm">
                      {listing.brand ? `${listing.brand} · ` : ""}
                      {listing.offerCount} boutique(s) · dès {formatFCFA(listing.price)}
                    </p>
                  </div>
                  {listing.myOfferId ? (
                    <Link
                      href={`/vendeur/produits/${listing.myOfferId}`}
                      className="text-brand-700 shrink-0 text-sm font-semibold underline"
                    >
                      Vous le vendez déjà
                    </Link>
                  ) : (
                    <Link
                      href={`/vendeur/fiches/${listing.id}`}
                      className="bg-brand-600 hover:bg-brand-700 shrink-0 rounded-full px-4 py-2 text-sm font-semibold text-white"
                    >
                      Vendre ce produit
                      <span className="sr-only"> : {listing.title}</span>
                    </Link>
                  )}
                </li>
              ))}
            </ul>
          )}

          <div className="border-ink-100 border-t pt-4">
            <h2 className="text-lg font-extrabold">2. Il n&apos;existe pas encore ?</h2>
            <p className="text-ink-500 mt-1 text-sm">
              Créez sa fiche : elle sera vérifiée par l&apos;équipe Kemdia avant d&apos;être en
              ligne.
            </p>
            <Link
              href="/vendeur/produits/nouveau?creer=1"
              className="border-ink-200 hover:bg-ink-50 mt-3 inline-flex items-center gap-2 rounded-full border-2 px-5 py-2.5 text-sm font-semibold"
            >
              <PackagePlus className="size-4" aria-hidden /> Créer une nouvelle fiche
            </Link>
          </div>
        </section>
      )}

      {creating &&
        (tree.length === 0 ? (
          <FormAlert>Catégories momentanément indisponibles. Rechargez dans un instant.</FormAlert>
        ) : (
          <div className="space-y-3 rounded-xl bg-white p-6">
            <Link
              href="/vendeur/produits/nouveau"
              className="text-brand-700 text-sm font-semibold underline"
            >
              ← Chercher d&apos;abord si le produit existe
            </Link>
            <ProductForm categories={categoryOptions(tree)} mode={{ kind: "create" }} />
          </div>
        ))}
    </VendorShell>
  );
}
