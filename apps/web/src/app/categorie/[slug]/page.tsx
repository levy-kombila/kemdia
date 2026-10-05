import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Breadcrumbs } from "@/components/catalog/Breadcrumbs";
import { ProductListing } from "@/components/catalog/ProductListing";
import { CategoryIcon } from "@/components/ui/CategoryIcon";
import {
  countProducts,
  getCategoryBySlug,
  getCategoryPath,
  getChildren,
  queryProducts,
} from "@/lib/catalog";
import { cn } from "@/lib/cn";
import { first, parsePage, parseSort } from "@/lib/search-params";

type Props = {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const category = getCategoryBySlug(slug);
  if (!category) return { title: "Catégorie introuvable" };
  return {
    title: category.name,
    description: `Achetez ${category.name} en ligne sur Kemdia : meilleurs prix au Gabon, paiement Mobile Money et livraison rapide.`,
    alternates: { canonical: `/categorie/${category.slug}` },
  };
}

export default async function CategoryPage({ params, searchParams }: Props) {
  const { slug } = await params;
  const category = getCategoryBySlug(slug);
  if (!category) notFound();

  const sp = await searchParams;
  const sort = parseSort(first(sp.tri));
  const page = parsePage(first(sp.page));
  const result = queryProducts({ categoryId: category.id, sort, page });

  const path = getCategoryPath(category.id);
  const parent = path.length > 1 ? path[path.length - 2] : undefined;
  // Sous-catégories ; si feuille, on affiche les « sœurs » pour naviguer latéralement
  const children = getChildren(category.id);
  const navItems = (children.length > 0 ? children : parent ? getChildren(parent.id) : []).map(
    (c) => ({
      ...c,
      count: countProducts(c.id),
    }),
  );

  return (
    <div className="container-page py-6">
      <Breadcrumbs items={path.map((c) => ({ label: c.name, href: `/categorie/${c.slug}` }))} />

      <header className="mb-6 flex items-center gap-4 rounded-3xl bg-white p-5 shadow-[var(--shadow-card)]">
        <span className="bg-brand-50 grid size-14 shrink-0 place-items-center rounded-2xl">
          <CategoryIcon name={category.icon} className="text-brand-600 size-7" />
        </span>
        <div>
          <h1 className="text-2xl font-extrabold sm:text-3xl">{category.name}</h1>
          <p className="text-ink-500 text-sm">
            {result.total} produits disponibles · Livraison partout au Gabon
          </p>
        </div>
      </header>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[15rem_1fr]">
        <aside aria-label="Sous-catégories" className="min-w-0">
          {navItems.length > 0 && (
            <div className="rounded-2xl bg-white p-4 shadow-[var(--shadow-card)] lg:sticky lg:top-40">
              <h2 className="text-ink-500 mb-3 text-sm font-bold uppercase tracking-wide">
                {children.length > 0 ? "Sous-catégories" : `Dans ${parent?.name ?? ""}`}
              </h2>
              <ul className="scrollbar-none -mx-1 flex gap-2 overflow-x-auto lg:flex-col lg:gap-0.5">
                {navItems.map((c) => (
                  <li key={c.id} className="shrink-0">
                    <Link
                      href={`/categorie/${c.slug}`}
                      aria-current={c.id === category.id ? "page" : undefined}
                      className={cn(
                        "flex items-center gap-2 whitespace-nowrap rounded-full px-3 py-1.5 text-sm lg:rounded-lg",
                        c.id === category.id
                          ? "bg-brand-600 text-white"
                          : "bg-ink-50 hover:bg-brand-50 hover:text-brand-700 lg:bg-transparent",
                      )}
                    >
                      <CategoryIcon name={c.icon} className="size-4" />
                      <span className="flex-1">{c.name}</span>
                      <span className="text-xs opacity-60">{c.count}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </aside>

        <ProductListing result={result} sort={sort} basePath={`/categorie/${category.slug}`} />
      </div>
    </div>
  );
}
