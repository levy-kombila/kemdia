import Image from "next/image";
import Link from "next/link";
import { formatFCFA } from "@/lib/format";
import type { Category, Product } from "@/lib/types";

/** Tuiles « un rayon, quatre produits » : un coup d'œil sur chaque univers sans quitter l'accueil. */
export function CategoryTiles({ tiles }: { tiles: { category: Category; products: Product[] }[] }) {
  return (
    <section
      aria-label="Nos univers"
      className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4"
    >
      {tiles.slice(0, 4).map(({ category, products }) => (
        <article key={category.id} className="flex flex-col rounded-xl bg-white p-4">
          <h2 className="text-lg font-extrabold">{category.name}</h2>
          <ul className="mt-3 grid grid-cols-4 gap-2 sm:grid-cols-2 sm:gap-3">
            {products.map((p) => (
              <li key={p.id}>
                <Link href={`/produit/${p.slug}`} className="group block">
                  <span className="bg-ink-50 relative block aspect-square overflow-hidden rounded-lg">
                    {p.images[0] && (
                      <Image
                        src={p.images[0]}
                        alt=""
                        fill
                        sizes="(min-width: 1280px) 10vw, (min-width: 640px) 22vw, 42vw"
                        className="object-contain p-2 mix-blend-multiply transition-transform group-hover:scale-105"
                      />
                    )}
                  </span>
                  <span className="text-ink-700 mt-1 hidden truncate text-xs sm:block">
                    {p.title}
                  </span>
                  <span className="font-price mt-0.5 block text-xs sm:text-sm">
                    {formatFCFA(p.price)}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
          <Link
            href={`/categorie/${category.slug}`}
            className="text-brand-700 mt-auto pt-3 text-sm font-semibold hover:underline"
          >
            Tout le rayon {category.name}
          </Link>
        </article>
      ))}
    </section>
  );
}
