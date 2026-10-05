import { SearchX } from "lucide-react";
import type { Metadata } from "next";
import { Breadcrumbs } from "@/components/catalog/Breadcrumbs";
import { CatalogView } from "@/components/catalog/CatalogView";
import { CategoryBubbles } from "@/components/home/CategoryBubbles";
import { SectionHeader } from "@/components/home/SectionHeader";
import { ProductCard } from "@/components/product/ProductCard";
import { getBestsellers, getCategoryHighlights } from "@/lib/catalog";
import { first, parseQuery } from "@/lib/search-params";

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  const q = parseQuery(first((await searchParams).q));
  return {
    title: q ? `Recherche : ${q}` : "Tous les produits",
    // Les pages de résultats ne doivent pas être indexées (contenu dupliqué)
    robots: { index: false, follow: true },
  };
}

export default async function SearchPage({ searchParams }: Props) {
  const sp = await searchParams;
  const q = parseQuery(first(sp.q));

  const empty = (
    <div className="space-y-3">
      <div className="flex flex-col items-center gap-2 rounded-xl bg-white px-6 py-10 text-center">
        <SearchX className="text-ink-400 size-12" aria-hidden />
        {/* q est affiché via React : échappé automatiquement (pas de XSS réfléchi) */}
        <h2 className="text-xl font-extrabold">Aucun résultat pour « {q} »</h2>
        <p className="text-ink-500 max-w-md text-sm">
          Vérifiez l&apos;orthographe, essayez un mot plus général (ex. « écouteurs » au lieu
          d&apos;une référence) ou parcourez les rayons.
        </p>
      </div>
      <CategoryBubbles items={getCategoryHighlights(12)} />
      <section aria-labelledby="suggestions">
        <SectionHeader
          id="suggestions"
          title="Les plus vendus en ce moment"
          href="/recherche?tri=note"
        />
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 sm:gap-3 xl:grid-cols-4">
          {getBestsellers(8).map((p) => (
            <ProductCard key={p.id} product={p} />
          ))}
        </div>
      </section>
    </div>
  );

  return (
    <div className="container-page space-y-3 py-4">
      <Breadcrumbs items={[{ label: q ? "Recherche" : "Tous les produits" }]} />
      <header className="rounded-xl bg-white px-5 py-4">
        <h1 className="text-2xl font-extrabold sm:text-3xl">
          {q ? `Résultats pour « ${q} »` : "Tous nos produits"}
        </h1>
      </header>
      <CatalogView
        basePath="/recherche"
        baseParams={q ? { q } : {}}
        query={{ q }}
        searchParams={sp}
        emptyState={empty}
      />
    </div>
  );
}
