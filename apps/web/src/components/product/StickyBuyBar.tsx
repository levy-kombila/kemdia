"use client";

import { Price } from "@/components/ui/Price";
import type { CartLine } from "@/lib/cart";
import { AddToCartButton } from "./AddToCartButton";

/** Barre d'achat collée en bas de l'écran sur mobile : le bouton reste à portée de pouce pendant la lecture. */
export function StickyBuyBar({
  line,
  oldPrice,
}: {
  line: Omit<CartLine, "quantity">;
  oldPrice: number | null;
}) {
  return (
    <div className="border-ink-100 fixed inset-x-0 bottom-0 z-40 flex items-center gap-3 border-t bg-white px-4 py-2.5 pb-[calc(0.625rem+env(safe-area-inset-bottom))] shadow-[0_-4px_16px_rgb(20_24_30/0.08)] lg:hidden">
      <Price price={line.price} oldPrice={oldPrice} size="sm" className="min-w-0" />
      <AddToCartButton line={line} className="ml-auto h-11 shrink-0 px-5 text-sm" />
    </div>
  );
}
