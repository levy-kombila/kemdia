import Image from "next/image";
import Link from "next/link";
import { Price } from "@/components/ui/Price";
import { Rating } from "@/components/ui/Rating";
import { discountPercent, truncate } from "@/lib/format";
import type { Product } from "@/lib/types";
import { AddToCartButton } from "./AddToCartButton";

export type CardBadge = "featured" | "new" | "bestseller";

export function toCartLine(p: Product) {
  return {
    productId: p.id,
    slug: p.slug,
    title: p.title,
    price: p.price,
    image: p.images[0] ?? null,
    maxQuantity: p.stock,
  };
}

/**
 * Carte produit unique (remplace les 3 partials Django product_card_featured/new/bestseller,
 * ~760 lignes dupliquées) : la variante se choisit via la prop `badge`.
 */
export function ProductCard({
  product,
  badge,
  rank,
}: {
  product: Product;
  badge?: CardBadge;
  rank?: number;
}) {
  const discount = discountPercent(product.price, product.oldPrice);
  const href = `/produit/${product.slug}`;
  const image = product.images[0] ?? "/images/placeholder.svg";

  return (
    <article className="group relative flex h-full flex-col overflow-hidden rounded-[var(--radius-card)] bg-white shadow-[var(--shadow-card)] transition-shadow hover:shadow-[var(--shadow-card-hover)]">
      <div className="bg-ink-100 relative aspect-square overflow-hidden">
        <Link href={href} tabIndex={-1} aria-hidden>
          <Image
            src={image}
            alt=""
            fill
            sizes="(min-width: 1024px) 22vw, (min-width: 640px) 30vw, 48vw"
            className="object-cover transition-transform duration-500 group-hover:scale-105"
          />
        </Link>

        <div className="pointer-events-none absolute left-2 top-2 flex flex-col items-start gap-1">
          {badge === "featured" && (
            <span className="bg-brand-600 rounded-full px-2 py-0.5 text-[0.65rem] font-bold tracking-wide text-white">
              EN VEDETTE
            </span>
          )}
          {badge === "bestseller" && (
            <span className="bg-ink-900 text-accent-400 rounded-full px-2 py-0.5 text-[0.65rem] font-bold tracking-wide">
              {rank ? `TOP ${rank}` : "TOP VENTE"}
            </span>
          )}
          {(badge === "new" || (!badge && product.isNew)) && (
            <span className="bg-success-600 rounded-full px-2 py-0.5 text-[0.65rem] font-bold tracking-wide text-white">
              NOUVEAU
            </span>
          )}
        </div>
        {discount && (
          <span className="bg-accent-400 text-ink-900 pointer-events-none absolute right-2 top-2 rounded-full px-2 py-0.5 text-xs font-extrabold">
            -{discount}%
          </span>
        )}
        {product.stock <= 0 && (
          <span className="bg-ink-900/80 pointer-events-none absolute inset-x-0 bottom-0 py-1 text-center text-xs font-semibold text-white">
            Rupture de stock
          </span>
        )}
      </div>

      <div className="flex flex-1 flex-col gap-1.5 p-3">
        {product.brand && (
          <span className="text-ink-500 text-[0.7rem] font-medium uppercase tracking-wide">
            {product.brand}
          </span>
        )}
        <h3 className="text-ink-900 line-clamp-2 min-h-[2.5rem] text-sm font-semibold leading-5">
          <Link
            href={href}
            className="after:absolute after:inset-0 after:content-[''] focus-visible:outline-none"
          >
            {truncate(product.title, 60)}
          </Link>
        </h3>
        <Rating value={product.rating} count={product.reviewCount} />
        <div className="mt-auto flex items-end justify-between gap-2 pt-1">
          <Price
            price={product.price}
            oldPrice={product.oldPrice}
            size="sm"
            className="flex-col gap-0"
          />
          {/* z-10 : le bouton reste cliquable au-dessus du lien « carte entière » */}
          <AddToCartButton
            line={toCartLine(product)}
            variant="icon"
            className="relative z-10 shrink-0"
          />
        </div>
      </div>
    </article>
  );
}
