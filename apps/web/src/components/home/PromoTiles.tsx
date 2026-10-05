import { ArrowRight, BadgePercent, Sparkles, Zap } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import type { Product } from "@/lib/types";
import { Countdown } from "./Countdown";

function Thumbs({ products }: { products: Product[] }) {
  return (
    <div className="pointer-events-none absolute -bottom-4 -right-4 flex rotate-[-8deg] gap-2">
      {products.slice(0, 2).map((p) => (
        <div
          key={p.id}
          className="relative size-24 overflow-hidden rounded-2xl border-4 border-white/80 shadow-lg"
        >
          {p.images[0] && (
            <Image src={p.images[0]} alt="" fill sizes="96px" className="object-cover" />
          )}
        </div>
      ))}
    </div>
  );
}

export function PromoTiles({ deals, news }: { deals: Product[]; news: Product[] }) {
  return (
    <section className="grid gap-4 md:grid-cols-3" aria-label="Offres à la une">
      <article
        id="ventes-flash"
        className="from-brand-600 via-brand-500 to-accent-500 relative min-h-56 overflow-hidden rounded-3xl bg-gradient-to-br p-6 text-white"
      >
        <h2 className="flex items-center gap-2 text-2xl font-extrabold">
          <Zap className="fill-accent-300 text-accent-300 size-7" aria-hidden /> VENTES FLASH
        </h2>
        <p className="mb-4 mt-1 text-sm text-white/90">Offres limitées, prix imbattables !</p>
        <Countdown />
        <Link
          href="/promotions"
          className="hover:text-brand-700 relative z-10 mt-5 inline-flex items-center gap-2 rounded-full border border-white/80 px-4 py-2 text-sm font-semibold hover:bg-white"
        >
          Voir les offres <ArrowRight className="size-4" aria-hidden />
        </Link>
        <Thumbs products={deals} />
      </article>

      <article className="bg-ink-900 relative min-h-56 overflow-hidden rounded-3xl p-6 text-white">
        <span className="bg-brand-600 inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-bold">
          <Sparkles className="size-3.5" aria-hidden /> NOUVEAUTÉS
        </span>
        <h2 className="mt-3 text-2xl font-extrabold leading-tight">
          Les derniers <span className="text-brand-500">arrivages</span>
        </h2>
        <p className="mt-2 max-w-[14rem] text-sm text-white/75">
          Découvrez nos nouveaux produits chaque semaine.
        </p>
        <Link
          href="/recherche?tri=nouveautes"
          className="hover:text-ink-900 relative z-10 mt-5 inline-flex items-center gap-2 rounded-full border border-white/60 px-4 py-2 text-sm font-semibold hover:bg-white"
        >
          Explorer <ArrowRight className="size-4" aria-hidden />
        </Link>
        <Thumbs products={news} />
      </article>

      <article className="bg-brand-50 text-ink-900 relative min-h-56 overflow-hidden rounded-3xl p-6">
        <span className="bg-brand-600 inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-bold text-white">
          <BadgePercent className="size-3.5" aria-hidden /> PROMOTIONS
        </span>
        <h2 className="mt-3 text-2xl font-extrabold leading-tight">
          Jusqu&apos;à <span className="text-brand-600">-20 %</span>
          <br /> sur une sélection
        </h2>
        <p className="text-ink-500 mt-2 max-w-[14rem] text-sm">
          Profitez-en avant qu&apos;il ne soit trop tard.
        </p>
        <Link
          href="/promotions"
          className="bg-ink-900 hover:bg-brand-600 relative z-10 mt-5 inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold text-white"
        >
          Voir tout <ArrowRight className="size-4" aria-hidden />
        </Link>
        <Thumbs products={deals.slice(2)} />
      </article>
    </section>
  );
}
