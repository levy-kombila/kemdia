import { SlidersHorizontal, X } from "lucide-react";
import { FilterSheet } from "./FilterSheet";
import Link from "next/link";
import { Suspense, type ReactNode } from "react";
import { getFacets, queryProducts, type ProductQuery } from "@/lib/catalog";
import { countActiveFilters, filtersToParams, parseFilters, PRICE_BUCKETS } from "@/lib/filters";
import { first, parsePage, parseSort, SORT_OPTIONS } from "@/lib/search-params";
import { FilterPanel, filterHref } from "./FilterPanel";
import { ProductListing } from "./ProductListing";
import { SortSelect } from "./SortSelect";

type Props = {
  basePath: string;
  /** Paramètres propres à la page à conserver (ex. q) */
  baseParams?: Record<string, string>;
  query: Pick<ProductQuery, "categoryId" | "q" | "onlyDeals">;
  searchParams: Record<string, string | string[] | undefined>;
  /** Bloc affiché en haut de la colonne de gauche (ex. sous-rayons) */
  sideTop?: ReactNode;
  /** Affiché à la place de la grille quand la recherche ne donne rien (sans filtre actif) */
  emptyState?: ReactNode;
};

/**
 * Page de liste commune (catégorie, recherche, promotions) : filtres à gauche, filtres actifs en pastilles,
 * tri, grille et pagination. Tout passe par l'URL, validée par liste blanche.
 */
export function CatalogView({
  basePath,
  baseParams = {},
  query,
  searchParams,
  sideTop,
  emptyState,
}: Props) {
  const facets = getFacets(query);
  const filters = parseFilters(
    searchParams,
    facets.brands.map((b) => b.name),
  );
  const sort = parseSort(first(searchParams.tri));
  const page = parsePage(first(searchParams.page));
  const result = queryProducts({ ...query, sort, page, pageSize: 20, filters });
  const ctx = { basePath, baseParams, filters, sort };
  const active = countActiveFilters(filters);

  const chips: { label: string; href: string }[] = [
    ...(filters.price
      ? [
          {
            label: PRICE_BUCKETS[filters.price].label,
            href: filterHref(ctx, { ...filters, price: undefined }),
          },
        ]
      : []),
    ...filters.brands.map((b) => ({
      label: b,
      href: filterHref(ctx, { ...filters, brands: filters.brands.filter((x) => x !== b) }),
    })),
    ...(filters.onlyDeals
      ? [{ label: "En promotion", href: filterHref(ctx, { ...filters, onlyDeals: false }) }]
      : []),
    ...(filters.inStock
      ? [{ label: "En stock", href: filterHref(ctx, { ...filters, inStock: false }) }]
      : []),
    ...(filters.minRating
      ? [
          {
            label: "4 étoiles et plus",
            href: filterHref(ctx, { ...filters, minRating: undefined }),
          },
        ]
      : []),
  ];
  const clearHref = filterHref(ctx, { brands: [], inStock: false, onlyDeals: false });
  const panel = <FilterPanel ctx={ctx} facets={facets} />;

  return (
    <div className="grid grid-cols-1 gap-3 lg:grid-cols-[15rem_1fr]">
      <aside aria-label="Filtres" className="hidden space-y-3 lg:block">
        {sideTop}
        <div className="rounded-xl bg-white p-4">
          <h2 className="mb-3 flex items-center gap-2 text-base font-bold">
            <SlidersHorizontal className="size-4" aria-hidden /> Filtrer
          </h2>
          {panel}
        </div>
      </aside>

      <div className="min-w-0">
        <div className="mb-3 flex flex-wrap items-center gap-2 rounded-xl bg-white px-4 py-2.5">
          <p className="text-ink-500 mr-auto text-sm">
            <strong className="text-ink-900">{result.total}</strong> produit
            {result.total > 1 ? "s" : ""}
          </p>
          <FilterSheet active={active} total={result.total}>
            {sideTop && <div className="mb-4">{sideTop}</div>}
            {panel}
          </FilterSheet>
          <Suspense>
            <SortSelect value={sort} options={SORT_OPTIONS} />
          </Suspense>
          {chips.length > 0 && (
            <ul
              className="flex w-full flex-wrap items-center gap-2 pt-1"
              aria-label="Filtres actifs"
            >
              {chips.map((c) => (
                <li key={c.label}>
                  <Link
                    href={c.href}
                    scroll={false}
                    className="bg-brand-50 text-brand-800 hover:bg-brand-100 inline-flex items-center gap-1 rounded-full py-1 pl-3 pr-2 text-sm font-medium"
                  >
                    {c.label}
                    <X className="size-3.5" aria-label="retirer" />
                  </Link>
                </li>
              ))}
              <li>
                <Link
                  href={clearHref}
                  scroll={false}
                  className="text-ink-500 hover:text-brand-700 text-sm underline"
                >
                  Tout effacer
                </Link>
              </li>
            </ul>
          )}
        </div>

        {result.total === 0 && active === 0 && emptyState ? (
          emptyState
        ) : (
          <ProductListing
            result={result}
            sort={sort}
            basePath={basePath}
            params={{ ...baseParams, ...filtersToParams(filters) }}
          />
        )}
      </div>
    </div>
  );
}
