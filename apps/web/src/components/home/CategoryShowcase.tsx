import { ArrowRight, Headset, Lock, RotateCcw, Truck } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { CategoryIcon } from "@/components/ui/CategoryIcon";
import type { Category } from "@/lib/types";

const ADVANTAGES = [
  { icon: Truck, title: "Livraison rapide", sub: "24 h – 48 h à Libreville" },
  { icon: Lock, title: "Paiement sécurisé", sub: "Mobile Money, carte" },
  { icon: RotateCcw, title: "Retours gratuits", sub: "Satisfait ou remboursé" },
  { icon: Headset, title: "Service client", sub: "Disponible 7j/7" },
];

export function CategoryShowcase({ categories }: { categories: (Category & { count: number })[] }) {
  return (
    <section className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_1.15fr]">
      <ul
        className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-2 xl:grid-cols-4"
        aria-label="Nos engagements"
      >
        {ADVANTAGES.map(({ icon: Icon, title, sub }) => (
          <li
            key={title}
            className="flex flex-col items-center justify-center rounded-2xl bg-white p-4 text-center shadow-[var(--shadow-card)]"
          >
            <span className="bg-brand-50 mb-2 grid size-12 place-items-center rounded-full">
              <Icon className="text-brand-600 size-6" aria-hidden />
            </span>
            <span className="text-sm font-bold">{title}</span>
            <span className="text-ink-500 text-xs">{sub}</span>
          </li>
        ))}
      </ul>

      <div className="bg-ink-900 min-w-0 rounded-3xl p-6 text-white">
        <div className="mb-5 flex items-center justify-between">
          <h2 className="text-xl font-bold">Catégories populaires</h2>
          <Link
            href="/categories"
            className="text-brand-500 flex items-center gap-1 text-sm font-medium hover:underline"
          >
            Voir tout <ArrowRight className="size-4" aria-hidden />
          </Link>
        </div>
        <ul className="scrollbar-none -mx-2 flex gap-4 overflow-x-auto px-2 pb-1 sm:justify-between">
          {categories.map((c) => (
            <li key={c.id} className="shrink-0">
              <Link
                href={`/categorie/${c.slug}`}
                className="group flex w-20 flex-col items-center gap-2 text-center"
              >
                <span className="group-hover:ring-brand-500 relative grid size-20 place-items-center overflow-hidden rounded-full bg-white ring-2 ring-transparent transition">
                  {c.image ? (
                    <Image src={c.image} alt="" fill sizes="80px" className="object-cover" />
                  ) : (
                    <CategoryIcon name={c.icon} className="text-brand-600 size-8" />
                  )}
                </span>
                <span className="text-xs font-semibold leading-tight">{c.name}</span>
                <span className="-mt-1.5 text-[0.65rem] text-white/50">{c.count} articles</span>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
