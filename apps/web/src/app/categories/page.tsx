import type { Metadata } from "next";
import { ProductImage } from "@/components/ui/ProductImage";
import Link from "next/link";
import { Breadcrumbs } from "@/components/catalog/Breadcrumbs";
import { CategoryIcon } from "@/components/ui/CategoryIcon";
import { countProducts, getCategoryTree } from "@/lib/catalog";

/** Nombre de produits de chaque grand rayon (sous-rayons compris), en parallèle. */
async function rootCounts(slugs: string[]): Promise<Map<string, number>> {
  const counts = await Promise.all(slugs.map((slug) => countProducts(slug)));
  return new Map(slugs.map((slug, i) => [slug, counts[i] ?? 0]));
}

export const metadata: Metadata = { title: "Toutes les catégories" };

export default async function CategoriesPage() {
  const tree = await getCategoryTree();
  const counts = await rootCounts(tree.map((root) => root.slug));
  return (
    <div className="container-page py-6">
      <Breadcrumbs items={[{ label: "Catégories" }]} />
      <h1 className="mb-6 text-3xl font-extrabold">Toutes nos catégories</h1>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {tree.map((root) => (
          <section key={root.id} className="overflow-hidden rounded-xl bg-white">
            <Link
              href={`/categorie/${root.slug}`}
              className="bg-ink-900 group relative flex h-32 items-end p-5"
            >
              {root.image && (
                <ProductImage
                  src={root.image}
                  alt=""
                  fill
                  sizes="(min-width: 1280px) 30vw, (min-width: 768px) 45vw, 90vw"
                  className="object-cover opacity-50 transition group-hover:opacity-60"
                />
              )}
              <h2 className="relative flex items-center gap-2 text-xl font-extrabold text-white">
                <CategoryIcon name={root.icon} className="size-6" />
                {root.name}
                <span className="text-sm font-medium text-white/70">
                  ({counts.get(root.slug) ?? 0})
                </span>
              </h2>
            </Link>
            <ul className="grid grid-cols-2 gap-x-4 gap-y-2 p-5 text-sm">
              {root.children.map((sub) => (
                <li key={sub.id}>
                  <Link
                    href={`/categorie/${sub.slug}`}
                    className="hover:text-brand-600 flex items-center gap-2"
                  >
                    <CategoryIcon name={sub.icon} className="text-ink-400 size-4" />
                    {sub.name}
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </div>
  );
}
