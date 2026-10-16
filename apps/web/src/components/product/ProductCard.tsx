import { ProductImage } from "@/components/ui/ProductImage";
import Link from "next/link";
import { SlidersHorizontal, Truck } from "lucide-react";
import { DiscountSticker, Price } from "@/components/ui/Price";
import { Rating } from "@/components/ui/Rating";
import { cn } from "@/lib/cn";
import { discountPercent, truncate } from "@/lib/format";
import type { ProductSummary } from "@/lib/types";
import { AddToCartButton } from "./AddToCartButton";
import { FavoriteButton } from "./FavoriteButton";

export type CardBadge = "featured" | "new" | "bestseller";

/** Favori : par produit ; variante mémorisée seulement s'il n'y a pas de choix à faire. */
export function toFavorite(p: ProductSummary) {
  return {
    productId: p.id,
    ...(p.variantCount === 1 ? { variantId: p.variantId } : {}),
    slug: p.slug,
    title: p.title,
    price: p.price,
    oldPrice: p.compareAtPrice,
    image: p.image,
    inStock: p.inStock,
  };
}

/** Ligne de panier depuis une liste : la variante par défaut (la moins chère), avec son stock. */
export function toCartLine(p: ProductSummary) {
  return {
    variantId: p.variantId,
    productId: p.id,
    slug: p.slug,
    title: p.title,
    variantName: "",
    price: p.price,
    image: p.image,
    maxQuantity: p.stock,
  };
}

const LABEL_STYLES = {
  red: "bg-brand-600 text-white",
  dark: "bg-ink-900 text-accent-400",
  green: "bg-forest-600 text-white",
} as const;

function cardLabel(
  product: ProductSummary,
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
  product: ProductSummary;
  badge?: CardBadge;
  rank?: number;
  /** Cartes visibles dès l'ouverture d'une liste : photo chargée en priorité (LCP) */
  preloadImage?: boolean;
}) {
  const discount = discountPercent(product.price, product.compareAtPrice);
  const href = `/produit/${product.slug}`;
  const image = product.image ?? "/images/placeholder.svg";
  const choice = product.variantCount > 1;
  const label = cardLabel(product, badge, rank);

  return (
    <article className="group relative flex h-full flex-col rounded-xl bg-white p-2.5 ring-1 ring-black/5 transition-shadow hover:shadow-[var(--shadow-card-hover)]">
      <div className="relative aspect-square overflow-hidden rounded-lg bg-white">
        {/* Conteneur positionné de l'image `fill` (exigence de next/image). Pas de lien ici : celui du titre
            couvre déjà toute la carte (after:inset-0). Un lien de moins par carte = moins de travail au chargement
            (S3-T08 : ~60 composants Link de moins sur l'accueil). */}
        <span className="absolute inset-0">
          <ProductImage
            src={image}
            alt=""
            fill
            sizes="(min-width: 1280px) 15vw, (min-width: 1024px) 20vw, (min-width: 640px) 30vw, 46vw"
            preload={preloadImage}
            className="object-contain p-1.5 transition-transform duration-300 group-hover:scale-[1.04]"
          />
        </span>

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
        {!product.inStock && (
          <span className="bg-ink-900/85 pointer-events-none absolute bottom-2 left-1 rounded px-2 py-1 text-xs font-semibold text-white">
            Rupture de stock
          </span>
        )}
      </div>

      <div className="flex flex-1 flex-col gap-1 px-0.5 pt-2.5">
        <h3 className="text-ink-800 line-clamp-2 h-10 text-[0.85rem] leading-5">
          <Link
            href={href}
            className="after:absolute after:inset-0 after:content-[''] focus-visible:outline-none"
          >
            {truncate(product.title, 70)}
          </Link>
        </h3>
        <Rating value={product.rating} count={product.reviewCount} />
        <div className="mt-auto flex items-end justify-between gap-2 pt-1.5">
          <Price
            price={product.price}
            oldPrice={product.compareAtPrice}
            size="sm"
            prefix={choice ? "dès" : undefined}
          />
          {/* z-10 : le bouton reste cliquable au-dessus du lien « carte entière » */}
          {choice ? (
            <Link
              href={href}
              aria-label={`Choisir une option pour « ${product.title} »`}
              className="bg-brand-600 hover:bg-brand-700 relative z-10 grid size-10 shrink-0 place-items-center rounded-full text-white"
            >
              <SlidersHorizontal className="size-5" aria-hidden />
            </Link>
          ) : (
            <AddToCartButton
              line={toCartLine(product)}
              variant="icon"
              className="relative z-10 shrink-0"
            />
          )}
        </div>
        {product.inStock && (
          <p className="text-forest-700 flex min-w-0 items-center gap-1 text-[0.72rem] font-medium">
            <Truck className="size-3.5 shrink-0" aria-hidden />
            <span className="truncate">
              {!choice && product.stock <= 5
                ? `Plus que ${product.stock} en stock`
                : "Livré en 24–48 h"}
            </span>
          </p>
        )}
      </div>
    </article>
  );
}
