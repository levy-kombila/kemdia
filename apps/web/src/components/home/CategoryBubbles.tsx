import Image from "next/image";
import Link from "next/link";
import type { CategoryHighlight } from "@/lib/catalog";

/** Rangée de ronds : accès direct aux rayons, défilable au doigt sur mobile. */
export function CategoryBubbles({ items }: { items: CategoryHighlight[] }) {
  return (
    <section aria-labelledby="rayons" className="rounded-xl bg-white px-3 py-4 sm:px-5">
      <h2 id="rayons" className="mb-3 px-1 text-lg font-extrabold">
        Parcourir les rayons
      </h2>
      <ul className="scrollbar-none -mx-3 flex gap-3 overflow-x-auto px-3 sm:gap-5 lg:justify-between">
        {items.map(({ category, image }) => (
          <li key={category.id} className="shrink-0">
            <Link
              href={`/categorie/${category.slug}`}
              className="group flex w-[4.75rem] flex-col items-center gap-2 text-center"
            >
              <span className="bg-ink-50 group-hover:ring-brand-600 relative size-[4.75rem] overflow-hidden rounded-full ring-2 ring-transparent transition">
                <Image
                  src={image}
                  alt=""
                  fill
                  sizes="76px"
                  className="object-contain p-2 mix-blend-multiply"
                />
              </span>
              <span className="text-ink-800 text-xs font-semibold leading-tight">
                {category.name}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
