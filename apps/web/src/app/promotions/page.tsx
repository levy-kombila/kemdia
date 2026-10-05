import { Zap } from "lucide-react";
import type { Metadata } from "next";
import { Breadcrumbs } from "@/components/catalog/Breadcrumbs";
import { CatalogView } from "@/components/catalog/CatalogView";
import { Countdown } from "@/components/home/Countdown";

export const metadata: Metadata = {
  title: "Promotions et ventes flash",
  description:
    "Toutes les promotions Kemdia : jusqu'à -20 % sur une sélection d'articles, livrés partout au Gabon.",
};

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export default async function PromotionsPage({ searchParams }: Props) {
  return (
    <div className="container-page space-y-3 py-4">
      <Breadcrumbs items={[{ label: "Promotions" }]} />
      <header
        id="ventes-flash"
        className="bg-brand-600 flex flex-col gap-3 rounded-xl px-5 py-5 text-white sm:flex-row sm:items-center sm:justify-between"
      >
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-extrabold sm:text-3xl">
            <Zap className="fill-accent-400 text-accent-400 size-7" aria-hidden /> Promotions et
            ventes flash
          </h1>
          <p className="mt-1 text-white">
            Des prix réduits sur une sélection d&apos;articles, chaque jour.
          </p>
        </div>
        <p className="flex items-center gap-2 text-sm">
          Se termine dans <Countdown compact />
        </p>
      </header>
      <CatalogView
        basePath="/promotions"
        query={{ onlyDeals: true }}
        searchParams={await searchParams}
      />
    </div>
  );
}
