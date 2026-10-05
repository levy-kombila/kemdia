import { Zap } from "lucide-react";
import type { Metadata } from "next";
import { Breadcrumbs } from "@/components/catalog/Breadcrumbs";
import { ProductListing } from "@/components/catalog/ProductListing";
import { Countdown } from "@/components/home/Countdown";
import { queryProducts } from "@/lib/catalog";
import { first, parsePage, parseSort } from "@/lib/search-params";

export const metadata: Metadata = {
  title: "Promotions et ventes flash",
  description:
    "Toutes les promotions Kemdia : jusqu'à -20 % sur une sélection d'articles, livrés partout au Gabon.",
};

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export default async function PromotionsPage({ searchParams }: Props) {
  const sp = await searchParams;
  const sort = parseSort(first(sp.tri));
  const page = parsePage(first(sp.page));
  const result = queryProducts({ onlyDeals: true, sort, page });

  return (
    <div className="container-page py-6">
      <Breadcrumbs items={[{ label: "Promotions" }]} />
      <header
        id="ventes-flash"
        className="from-brand-600 via-brand-500 to-accent-500 mb-6 flex flex-col justify-between gap-4 rounded-3xl bg-gradient-to-br p-6 text-white sm:flex-row sm:items-center"
      >
        <div>
          <h1 className="flex items-center gap-2 text-3xl font-extrabold">
            <Zap className="fill-accent-300 text-accent-300 size-8" aria-hidden /> Promotions &
            ventes flash
          </h1>
          <p className="mt-1 text-white/90">
            Des prix réduits sur une sélection d&apos;articles, chaque jour.
          </p>
        </div>
        <Countdown />
      </header>
      <ProductListing result={result} sort={sort} basePath="/promotions" />
    </div>
  );
}
