"use client";

import { Heart, Trash2 } from "lucide-react";
import { ProductImage } from "@/components/ui/ProductImage";
import Link from "next/link";
import { AddToCartButton } from "@/components/product/AddToCartButton";
import { useFavorites } from "@/components/providers/FavoritesProvider";
import { DiscountSticker, Price } from "@/components/ui/Price";
import { discountPercent } from "@/lib/format";

export function FavoritesView() {
  const { items, hydrated, remove } = useFavorites();

  if (!hydrated)
    return (
      <div
        className="h-64 animate-pulse rounded-xl bg-white"
        aria-busy="true"
        aria-label="Chargement des favoris"
      />
    );

  return (
    <>
      <header className="rounded-xl bg-white px-5 py-4">
        <h1 className="text-2xl font-extrabold sm:text-3xl">Mes favoris</h1>
        <p className="text-ink-500 text-sm">
          {items.length > 0
            ? `${items.length} produit${items.length > 1 ? "s" : ""} gardé${items.length > 1 ? "s" : ""} sur cet appareil`
            : "Gardez de côté les produits qui vous plaisent."}
        </p>
      </header>

      {items.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-xl bg-white px-6 py-14 text-center">
          <span className="bg-brand-50 grid size-20 place-items-center rounded-full">
            <Heart className="text-brand-600 size-9" aria-hidden />
          </span>
          <h2 className="text-xl font-extrabold">Aucun favori pour le moment</h2>
          <p className="text-ink-500 max-w-sm text-sm">
            Touchez le cœur sur un produit pour le retrouver ici et surveiller son prix.
          </p>
          <Link
            href="/"
            className="bg-brand-600 hover:bg-brand-700 mt-2 rounded-full px-6 py-3 font-semibold text-white"
          >
            Découvrir les produits
          </Link>
        </div>
      ) : (
        <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3 sm:gap-3 lg:grid-cols-4 xl:grid-cols-5">
          {items.map((f) => {
            const discount = discountPercent(f.price, f.oldPrice);
            return (
              <li
                key={f.productId}
                className="relative flex flex-col rounded-xl bg-white p-2.5 ring-1 ring-black/5"
              >
                <Link
                  href={`/produit/${f.slug}`}
                  className="relative block aspect-square overflow-hidden rounded-lg bg-white"
                >
                  {f.image && (
                    <ProductImage
                      src={f.image}
                      alt=""
                      fill
                      sizes="(min-width: 1024px) 20vw, 46vw"
                      className="object-contain p-1.5"
                    />
                  )}
                  {discount && (
                    <DiscountSticker percent={discount} className="absolute left-1 top-1.5" />
                  )}
                </Link>
                <Link
                  href={`/produit/${f.slug}`}
                  className="text-ink-800 hover:text-brand-700 mt-2 line-clamp-2 min-h-[2.5rem] text-[0.85rem] leading-5"
                >
                  {f.title}
                </Link>
                <Price price={f.price} oldPrice={f.oldPrice} size="sm" className="mt-1" />
                <div className="mt-auto flex items-center gap-2 pt-3">
                  {f.variantId ? (
                    <AddToCartButton
                      line={{
                        variantId: f.variantId,
                        productId: f.productId,
                        slug: f.slug,
                        title: f.title,
                        variantName: "",
                        price: f.price,
                        image: f.image,
                        maxQuantity: f.inStock ? 20 : 0,
                      }}
                      className="h-10 flex-1 px-3 text-sm"
                      label="Au panier"
                    />
                  ) : (
                    // Plusieurs variantes (couleur, taille…) : le choix se fait sur la fiche
                    <Link
                      href={`/produit/${f.slug}`}
                      className="bg-brand-600 hover:bg-brand-700 inline-flex h-10 flex-1 items-center justify-center rounded-full px-3 text-sm font-semibold text-white"
                    >
                      Choisir
                    </Link>
                  )}
                  <button
                    type="button"
                    onClick={() => remove(f.productId)}
                    aria-label={`Retirer « ${f.title} » des favoris`}
                    className="text-ink-500 hover:text-brand-700 hover:bg-ink-50 grid size-10 shrink-0 place-items-center rounded-full"
                  >
                    <Trash2 className="size-4" aria-hidden />
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
      {items.length > 0 && (
        <p className="text-ink-500 px-1 text-xs">
          Prix indicatifs relevés lors de l&apos;ajout. Le prix à jour est celui de la fiche produit
          et du panier.
        </p>
      )}
    </>
  );
}
