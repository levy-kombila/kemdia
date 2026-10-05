import { ChevronLeft, ChevronRight, PackageSearch } from "lucide-react";
import Link from "next/link";
import { ProductCard } from "@/components/product/ProductCard";
import { cn } from "@/lib/cn";
import type { SortKey } from "@/lib/search-params";
import type { Paginated, Product } from "@/lib/types";

type Props = {
  result: Paginated<Product>;
  sort: SortKey;
  basePath: string;
  /** Paramètres à conserver dans les liens (ex. q pour la recherche) */
  params?: Record<string, string>;
};

export function buildHref(
  basePath: string,
  params: Record<string, string>,
  overrides: Record<string, string | number>,
) {
  const sp = new URLSearchParams(params);
  for (const [k, v] of Object.entries(overrides)) sp.set(k, String(v));
  if (sp.get("page") === "1") sp.delete("page");
  if (sp.get("tri") === "pertinence") sp.delete("tri");
  const qs = sp.toString();
  return qs ? `${basePath}?${qs}` : basePath;
}

export function ProductListing({ result, sort, basePath, params = {} }: Props) {
  const { items, page, totalPages } = result;
  const keep = { ...params, ...(sort !== "pertinence" ? { tri: sort } : {}) };

  return (
    <div>
      {items.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-xl bg-white px-6 py-16 text-center">
          <PackageSearch className="text-ink-200 size-12" aria-hidden />
          <p className="font-display text-lg font-bold">Aucun produit ne correspond</p>
          <p className="text-ink-500 max-w-sm text-sm">
            Retirez un filtre, essayez un autre mot-clé ou parcourez nos rayons.
          </p>
          <Link
            href="/categories"
            className="bg-brand-600 mt-2 rounded-full px-5 py-2.5 text-sm font-semibold text-white"
          >
            Voir les catégories
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 sm:gap-3 xl:grid-cols-4">
          {items.map((p) => (
            <ProductCard key={p.id} product={p} />
          ))}
        </div>
      )}

      {totalPages > 1 && (
        <nav aria-label="Pagination" className="mt-8 flex items-center justify-center gap-1">
          <PageLink
            href={buildHref(basePath, keep, { page: page - 1 })}
            disabled={page <= 1}
            label="Page précédente"
          >
            <ChevronLeft className="size-4" />
          </PageLink>
          {Array.from({ length: totalPages }, (_, i) => i + 1).map((n) => (
            <Link
              key={n}
              href={buildHref(basePath, keep, { page: n })}
              aria-current={n === page ? "page" : undefined}
              className={cn(
                "grid size-10 place-items-center rounded-full text-sm font-semibold",
                n === page ? "bg-brand-600 text-white" : "hover:bg-brand-50 bg-white",
              )}
            >
              {n}
            </Link>
          ))}
          <PageLink
            href={buildHref(basePath, keep, { page: page + 1 })}
            disabled={page >= totalPages}
            label="Page suivante"
          >
            <ChevronRight className="size-4" />
          </PageLink>
        </nav>
      )}
    </div>
  );
}

function PageLink({
  href,
  disabled,
  label,
  children,
}: {
  href: string;
  disabled: boolean;
  label: string;
  children: React.ReactNode;
}) {
  if (disabled)
    return (
      <span aria-hidden className="text-ink-200 grid size-10 place-items-center rounded-full">
        {children}
      </span>
    );
  return (
    <Link
      href={href}
      aria-label={label}
      className="hover:bg-brand-50 grid size-10 place-items-center rounded-full bg-white"
    >
      {children}
    </Link>
  );
}
