import { Check, Star } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import type { ListingFacets } from "@/lib/catalog";
import { cn } from "@/lib/cn";
import { filtersToParams, type ProductFilters } from "@/lib/filters";

type Ctx = {
  basePath: string;
  baseParams: Record<string, string>;
  filters: ProductFilters;
  sort?: string;
};

/** Lien qui applique `next` comme nouveaux filtres (retour à la page 1, tri conservé). */
export function filterHref({ basePath, baseParams, sort }: Ctx, next: ProductFilters): string {
  const sp = new URLSearchParams({
    ...baseParams,
    ...filtersToParams(next),
    ...(sort && sort !== "pertinence" ? { tri: sort } : {}),
  });
  const qs = sp.toString();
  return qs ? `${basePath}?${qs}` : basePath;
}

function Option({
  href,
  active,
  label,
  count,
  round = false,
}: {
  href: string;
  active: boolean;
  label: ReactNode;
  count: number;
  round?: boolean;
}) {
  const disabled = count === 0 && !active;
  const box = (
    <span
      aria-hidden
      className={cn(
        "grid size-[1.1rem] shrink-0 place-items-center border-2",
        round ? "rounded-full" : "rounded",
        active ? "border-brand-600 bg-brand-600 text-white" : "border-ink-200 bg-white",
      )}
    >
      {active &&
        (round ? (
          <span className="size-1.5 rounded-full bg-white" />
        ) : (
          <Check className="size-3" strokeWidth={3} />
        ))}
    </span>
  );
  if (disabled)
    return (
      <span aria-disabled="true" className="text-ink-500 flex items-center gap-2.5 py-1.5 text-sm">
        {box}
        <span className="flex-1">{label}</span>
        <span className="text-xs">0</span>
      </span>
    );
  return (
    <Link
      href={href}
      scroll={false}
      className="hover:text-brand-700 group flex items-center gap-2.5 py-1.5 text-sm"
    >
      {box}
      <span className={cn("flex-1", active && "font-semibold")}>
        {label}
        {active && <span className="sr-only"> (filtre actif, cliquer pour le retirer)</span>}
      </span>
      <span className="text-ink-400 text-xs">{count}</span>
    </Link>
  );
}

function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="border-ink-100 border-t py-4 first:border-t-0 first:pt-0">
      <h3 className="mb-1.5 text-sm font-bold">{title}</h3>
      {children}
    </div>
  );
}

/** Panneau de filtres : de simples liens (fonctionne sans JavaScript, URL partageable). */
export function FilterPanel({ ctx, facets }: { ctx: Ctx; facets: ListingFacets }) {
  const f = ctx.filters;
  const brands = facets.brands.slice(0, 12);
  return (
    <div>
      <Group title="Prix">
        {facets.prices.map((p) => (
          <Option
            key={p.key}
            round
            href={filterHref(ctx, { ...f, price: f.price === p.key ? undefined : p.key })}
            active={f.price === p.key}
            label={p.label}
            count={p.count}
          />
        ))}
      </Group>
      {brands.length > 1 && (
        <Group title="Marque">
          {brands.map((b) => {
            const active = f.brands.includes(b.name);
            const next = active ? f.brands.filter((x) => x !== b.name) : [...f.brands, b.name];
            return (
              <Option
                key={b.name}
                href={filterHref(ctx, { ...f, brands: next })}
                active={active}
                label={b.name}
                count={b.count}
              />
            );
          })}
        </Group>
      )}
      <Group title="Offres et disponibilité">
        <Option
          href={filterHref(ctx, { ...f, onlyDeals: !f.onlyDeals })}
          active={f.onlyDeals}
          label="En promotion"
          count={facets.deals}
        />
        <Option
          href={filterHref(ctx, { ...f, inStock: !f.inStock })}
          active={f.inStock}
          label="En stock uniquement"
          count={facets.inStock}
        />
      </Group>
      <Group title="Avis clients">
        <Option
          href={filterHref(ctx, { ...f, minRating: f.minRating ? undefined : 4 })}
          active={!!f.minRating}
          label={
            <span className="inline-flex items-center gap-1">
              4 <Star className="fill-accent-400 text-accent-400 size-3.5" aria-label="étoiles" />{" "}
              et plus
            </span>
          }
          count={facets.rating4}
        />
      </Group>
    </div>
  );
}
