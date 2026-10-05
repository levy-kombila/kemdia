import type { Metadata } from "next";
import { Breadcrumbs } from "@/components/catalog/Breadcrumbs";
import { ProductListing } from "@/components/catalog/ProductListing";
import { SearchForm } from "@/components/layout/SearchForm";
import { queryProducts } from "@/lib/catalog";
import { first, parsePage, parseQuery, parseSort } from "@/lib/search-params";

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
  const sort = parseSort(first(sp.tri));
  const page = parsePage(first(sp.page));
  const result = queryProducts({ q, sort, page });

  return (
    <div className="container-page py-6">
      <Breadcrumbs items={[{ label: q ? "Recherche" : "Tous les produits" }]} />
      <header className="mb-6">
        <h1 className="text-2xl font-extrabold sm:text-3xl">
          {/* q est affiché via React : échappé automatiquement (pas de XSS réfléchi) */}
          {q ? (
            <>
              Résultats pour <span className="text-brand-600">« {q} »</span>
            </>
          ) : (
            "Tous nos produits"
          )}
        </h1>
        <SearchForm id="search-page-input" defaultValue={q} className="mt-4 max-w-xl" />
      </header>
      <ProductListing result={result} sort={sort} basePath="/recherche" params={q ? { q } : {}} />
    </div>
  );
}
