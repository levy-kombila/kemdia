import Image from "next/image";
import Link from "next/link";
import { Truck } from "lucide-react";
import { DiscountSticker, Price } from "@/components/ui/Price";
import { Rating } from "@/components/ui/Rating";
import { cn } from "@/lib/cn";
import { discountPercent, truncate } from "@/lib/format";
import type { Product } from "@/lib/types";
import { AddToCartButton } from "./AddToCartButton";
import { FavoriteButton } from "./FavoriteButton";

export type CardBadge = "featured" | "new" | "bestseller";

export function toFavorite(p: Product) {
  return {
    productId: p.id,
    slug: p.slug,
    title: p.title,
    price: p.price,
    oldPrice: p.oldPrice,
    image: p.images[0] ?? null,
    inStock: p.stock > 0,
  };
}

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

const LABEL_STYLES = {
  red: "bg-brand-600 text-white",
  dark: "bg-ink-900 text-accent-400",
  green: "bg-forest-600 text-white",
} as const;

function cardLabel(
  product: Product,
  badge: CardBadge | undefined,
  rank: number | undefined,
): { text: string; tone: keyof typeof LABEL_STYLES } | null {
  if (badge === "featured") return { text: "En vedette", tone: "red" };
  if (badge === "bestseller")
    return { text: rank ? `N° ${rank} des ventes` : "Top vente", tone: "dark" };
  if (badge === "new" || (!badge && product.isNew)) return { text: "Nouveau", tone: "green" };
  return null;
}

/**
 * Carte produit unique (remplace les 3 partials Django product_card_featured/new/bestseller,
 * ~760 lignes dupliquées) : la variante se choisit via la prop `badge`.
 */
export function ProductCard({
  product,
  badge,
  rank,
  preloadImage = false,
}: {
  product: Product;
  badge?: CardBadge;
  rank?: number;
  /** Cartes visibles dès l'ouverture d'une liste : photo chargée en priorité (LCP) */
  preloadImage?: boolean;
}) {
  const discount = discountPercent(product.price, product.oldPrice);
  const href = `/produit/${product.slug}`;
  const image = product.images[0] ?? "/images/placeholder.svg";
  const label = cardLabel(product, badge, rank);

  return (
    <article className="group relative flex h-full flex-col rounded-xl bg-white p-2.5 ring-1 ring-black/5 transition-shadow hover:shadow-[var(--shadow-card-hover)]">
      <div className="relative aspect-square overflow-hidden rounded-lg bg-white">
        <Link href={href} tabIndex={-1} aria-hidden>
          <Image
            src={image}
            alt=""
            fill
            sizes="(min-width: 1280px) 15vw, (min-width: 1024px) 20vw, (min-width: 640px) 30vw, 46vw"
            preload={preloadImage}
            className="object-contain p-1.5 transition-transform duration-300 group-hover:scale-[1.04]"
          />
        </Link>

        {discount && <DiscountSticker percent={discount} className="absolute left-1 top-1.5" />}
        {label && (
          <span
            className={cn(
              "pointer-events-none absolute right-1 top-1.5 rounded px-1.5 py-0.5 text-[0.68rem] font-bold",
              LABEL_STYLES[label.tone],
            )}
          >
            {label.text}
          </span>
        )}
        <FavoriteButton item={toFavorite(product)} className="absolute bottom-1.5 right-1.5 z-10" />
        {product.stock <= 0 && (
          <span className="bg-ink-900/85 pointer-events-none absolute inset-x-0 bottom-0 py-1 text-center text-xs font-semibold text-white">
            Rupture de stock
          </span>
        )}
      </div>

      <div className="flex flex-1 flex-col gap-1 px-0.5 pt-2.5">
        <h3 className="text-ink-800 line-clamp-2 min-h-[2.5rem] text-[0.85rem] leading-5">
          <Link
            href={href}
            className="after:absolute after:inset-0 after:content-[''] focus-visible:outline-none"
          >
            {truncate(product.title, 70)}
          </Link>
        </h3>
        <Rating value={product.rating} count={product.reviewCount} />
        <div className="mt-auto flex items-end justify-between gap-2 pt-1.5">
          <Price price={product.price} oldPrice={product.oldPrice} size="sm" />
          {/* z-10 : le bouton reste cliquable au-dessus du lien « carte entière » */}
          <AddToCartButton
            line={toCartLine(product)}
            variant="icon"
            className="relative z-10 shrink-0"
          />
        </div>
        {product.stock > 0 && (
          <p className="text-forest-700 flex items-center gap-1 text-[0.72rem] font-medium">
            <Truck className="size-3.5" aria-hidden />
            {product.stock <= 5
              ? `Plus que ${product.stock} en stock`
              : "Livré en 24–48 h à Libreville"}
          </p>
        )}
      </div>
    </article>
  );
}
