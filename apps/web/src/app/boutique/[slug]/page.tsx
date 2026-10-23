import { BadgeCheck, MapPin } from "lucide-react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Breadcrumbs } from "@/components/catalog/Breadcrumbs";
import { CatalogView } from "@/components/catalog/CatalogView";
import { getShop } from "@/lib/catalog";
import { productCountLabel, sellingSince } from "@/lib/shops";

type Props = {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const shop = await getShop((await params).slug);
  if (!shop) return { title: "Boutique introuvable" };
  return {
    title: `${shop.name} — boutique à ${shop.city}`,
    description: shop.description.slice(0, 160) || `Les produits de ${shop.name} sur Kemdia.`,
    alternates: { canonical: `/boutique/${shop.slug}` },
  };
}

/**
 * Page publique d'une boutique (S7.5-T07, ADR-0054) : nom, ville, quartier, description, date d'arrivée, puis ses
 * produits avec SON prix (tri, filtres et pages comme une catégorie). Jamais de téléphone : les achats passent par
 * Kemdia. Boutique inconnue, en attente ou suspendue : 404.
 */
export default async function ShopPage({ params, searchParams }: Props) {
  const [{ slug }, sp] = await Promise.all([params, searchParams]);
  const shop = await getShop(slug);
  if (!shop) notFound();

  return (
    <div className="container-page space-y-3 py-4">
      <Breadcrumbs items={[{ label: "Boutiques", href: "/boutiques" }, { label: shop.name }]} />
      <header className="space-y-2 rounded-xl bg-white px-5 py-4">
        <h1 className="flex flex-wrap items-center gap-2 text-2xl font-extrabold sm:text-3xl">
          {shop.name}
          {shop.official && (
            <span className="bg-brand-50 text-brand-800 inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-sm font-semibold">
              <BadgeCheck className="size-4" aria-hidden /> Boutique officielle
            </span>
          )}
        </h1>
        <p className="text-ink-500 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
          <span className="inline-flex items-center gap-1">
            <MapPin className="size-4" aria-hidden />
            {shop.city}
            {shop.neighborhood ? ` — ${shop.neighborhood}` : ""}
          </span>
          <span>{sellingSince(shop.since)}</span>
          <span>{productCountLabel(shop.productCount)}</span>
        </p>
        {shop.description && (
          <p className="text-ink-700 max-w-3xl whitespace-pre-line text-sm">{shop.description}</p>
        )}
      </header>
      <CatalogView
        basePath={`/boutique/${shop.slug}`}
        query={{ shop: shop.slug }}
        searchParams={sp}
        emptyState={
          <p className="text-ink-500 rounded-xl bg-white px-5 py-10 text-center">
            Cette boutique n&apos;a pas encore de produit en vente.
          </p>
        }
      />
    </div>
  );
}
