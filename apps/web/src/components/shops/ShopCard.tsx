import { BadgeCheck, MapPin, Store } from "lucide-react";
import Link from "next/link";
import type { PublicShop } from "@kemdia/contracts";
import { productCountLabel } from "@/lib/shops";

/** Carte d'une boutique dans l'annuaire (S7.5-T07) : textes affichés par React (échappés). */
export function ShopCard({ shop }: { shop: PublicShop }) {
  return (
    <Link
      href={`/boutique/${shop.slug}`}
      className="hover:ring-brand-100 flex h-full flex-col gap-2 rounded-xl bg-white p-4 transition hover:ring-4"
    >
      <span className="flex items-start gap-2">
        <Store className="text-brand-600 mt-0.5 size-5 shrink-0" aria-hidden />
        <span className="min-w-0 flex-1 font-bold">{shop.name}</span>
        {shop.official && (
          <span className="bg-brand-50 text-brand-800 inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold">
            <BadgeCheck className="size-3.5" aria-hidden /> Boutique officielle
          </span>
        )}
      </span>
      <span className="text-ink-500 flex items-center gap-1 text-sm">
        <MapPin className="size-4 shrink-0" aria-hidden />
        {shop.city}
        {shop.neighborhood ? ` — ${shop.neighborhood}` : ""}
      </span>
      {shop.description && (
        <span className="text-ink-700 line-clamp-2 text-sm">{shop.description}</span>
      )}
      <span className="text-ink-500 mt-auto text-xs font-medium">
        {productCountLabel(shop.productCount)}
      </span>
    </Link>
  );
}
