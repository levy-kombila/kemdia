import { ChevronRight, Zap } from "lucide-react";
import { ProductImage } from "@/components/ui/ProductImage";
import Link from "next/link";
import { ProductRail, RailItem } from "@/components/product/ProductRail";
import { DiscountSticker, Price } from "@/components/ui/Price";
import { discountPercent } from "@/lib/format";
import type { ProductSummary } from "@/lib/types";
import { Countdown } from "./Countdown";

const STOCK_SCALE = 50;

function DealCard({ product }: { product: ProductSummary }) {
  const discount = discountPercent(product.price, product.compareAtPrice);
  const left = Math.max(0, product.stock);
  const ratio = Math.min(1, left / STOCK_SCALE);
  return (
    <Link
      prefetch={false}
      href={`/produit/${product.slug}`}
      className="group flex h-full flex-col rounded-lg p-2 hover:shadow-[var(--shadow-card-hover)]"
    >
      <span className="relative block aspect-square overflow-hidden rounded-md bg-white">
        {product.image && (
          <ProductImage
            src={product.image}
            alt=""
            fill
            sizes="(min-width: 1024px) 15vw, 40vw"
            className="object-contain p-1.5 transition-transform group-hover:scale-[1.04]"
          />
        )}
        {discount && <DiscountSticker percent={discount} className="absolute left-1 top-1.5" />}
      </span>
      <span className="text-ink-800 mt-2 line-clamp-1 text-[0.85rem]">{product.title}</span>
      <Price price={product.price} oldPrice={product.compareAtPrice} size="sm" className="mt-1" />
      <span className="text-ink-700 mt-2 text-xs font-medium">
        {left <= 10 ? (
          <strong className="text-brand-700">Plus que {left} en stock</strong>
        ) : (
          `${left} en stock`
        )}
      </span>
      <span className="bg-ink-100 mt-1 block h-1.5 overflow-hidden rounded-full" aria-hidden>
        <span
          className="bg-brand-600 block h-full rounded-full"
          style={{ width: `${left === 0 ? 0 : Math.max(6, ratio * 100)}%` }}
        />
      </span>
    </Link>
  );
}

/** Bandeau « Ventes flash » : compte à rebours jusqu'à minuit, stock restant visible sur chaque offre. */
export function FlashSales({ deals }: { deals: ProductSummary[] }) {
  if (deals.length === 0) return null;
  return (
    <section
      id="ventes-flash"
      aria-labelledby="ventes-flash-titre"
      className="overflow-hidden rounded-xl bg-white"
    >
      <div className="bg-brand-600 flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-2.5 text-white sm:px-5">
        <h2
          id="ventes-flash-titre"
          className="flex items-center gap-2 text-base font-extrabold sm:text-xl"
        >
          <Zap className="fill-accent-400 text-accent-400 size-5" aria-hidden /> Ventes flash
        </h2>
        <p className="flex items-center gap-2 text-sm">
          <span className="hidden sm:inline">Se termine dans</span>
          <Countdown compact />
        </p>
        <Link
          prefetch={false}
          href="/promotions"
          className="ml-auto flex items-center text-sm font-semibold hover:underline"
        >
          Voir tout <ChevronRight className="size-4" aria-hidden />
        </Link>
      </div>
      <div className="px-2 py-3 sm:px-3">
        <ProductRail label="Ventes flash">
          {deals.map((p) => (
            <RailItem key={p.id} size="sm">
              <DealCard product={p} />
            </RailItem>
          ))}
        </ProductRail>
      </div>
    </section>
  );
}
