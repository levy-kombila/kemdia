import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Breadcrumbs } from "@/components/catalog/Breadcrumbs";
import { CatalogView } from "@/components/catalog/CatalogView";
import { CategoryBubbles } from "@/components/home/CategoryBubbles";
import { CategoryIcon } from "@/components/ui/CategoryIcon";
import {
  countProducts,
  getCategoryBySlug,
  getCategoryPath,
  getChildHighlights,
  getChildren,
} from "@/lib/catalog";
import { cn } from "@/lib/cn";

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

  const path = getCategoryPath(category.id);
  const parent = path.length > 1 ? path[path.length - 2] : undefined;
  // Sous-catégories ; si feuille, on affiche les « sœurs » pour naviguer latéralement
  const children = getChildren(category.id);
  const navItems = (children.length > 0 ? children : parent ? getChildren(parent.id) : [])
    .map((c) => ({ ...c, count: countProducts(c.id) }))
    .filter((c) => c.count > 0 || c.id === category.id);
  const total = countProducts(category.id);

  const sideNav =
    navItems.length > 0 ? (
      <nav aria-label="Rayons" className="rounded-xl bg-white p-4">
        <h2 className="mb-2 text-base font-bold">
          {children.length > 0 ? "Rayons" : `Dans ${parent?.name ?? ""}`}
        </h2>
        <ul className="space-y-0.5">
          {navItems.map((c) => (
            <li key={c.id}>
              <Link
                href={`/categorie/${c.slug}`}
                aria-current={c.id === category.id ? "page" : undefined}
                className={cn(
                  "flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm",
                  c.id === category.id
                    ? "bg-brand-50 text-brand-800 font-semibold"
                    : "hover:bg-ink-50 hover:text-brand-700",
                )}
              >
                <CategoryIcon name={c.icon} className="text-ink-500 size-4" />
                <span className="flex-1">{c.name}</span>
                <span className="text-ink-400 text-xs">{c.count}</span>
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    ) : null;

  return (
    <div className="container-page space-y-3 py-4">
      <Breadcrumbs items={path.map((c) => ({ label: c.name, href: `/categorie/${c.slug}` }))} />

      <header className="flex items-center gap-4 rounded-xl bg-white px-5 py-4">
        <span className="bg-brand-50 grid size-12 shrink-0 place-items-center rounded-xl">
          <CategoryIcon name={category.icon} className="text-brand-600 size-6" />
        </span>
        <div>
          <h1 className="text-2xl font-extrabold sm:text-3xl">{category.name}</h1>
          <p className="text-ink-500 text-sm">
            {total} produit{total > 1 ? "s" : ""}, livrés partout au Gabon
          </p>
        </div>
      </header>

      <CategoryBubbles
        items={getChildHighlights(category.id)}
        title={`Les rayons ${category.name}`}
      />

      <CatalogView
        basePath={`/categorie/${category.slug}`}
        query={{ categoryId: category.id }}
        searchParams={await searchParams}
        sideTop={sideNav}
      />
    </div>
  );
}
