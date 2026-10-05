"use client";

import { Check, ShoppingCart } from "lucide-react";
import { useState } from "react";
import { useCart } from "@/components/providers/CartProvider";
import { useToast } from "@/components/providers/ToastProvider";
import { cn } from "@/lib/cn";
import type { CartLine } from "@/lib/cart";

type Props = {
  line: Omit<CartLine, "quantity">;
  quantity?: number;
  variant?: "icon" | "full";
  className?: string;
};

export function AddToCartButton({ line, quantity = 1, variant = "full", className }: Props) {
  const { add } = useCart();
  const { notify } = useToast();
  const [done, setDone] = useState(false);
  const outOfStock = line.maxQuantity <= 0;

  function onClick() {
    if (outOfStock) return;
    add(line, quantity);
    notify(`${quantity} × « ${line.title} » ajouté au panier`);
    setDone(true);
    window.setTimeout(() => setDone(false), 1500);
  }

  if (variant === "icon") {
    return (
      <button
        type="button"
        onClick={onClick}
        disabled={outOfStock}
        aria-label={outOfStock ? "Rupture de stock" : `Ajouter « ${line.title} » au panier`}
        className={cn(
          "bg-brand-600 hover:bg-brand-700 disabled:bg-ink-200 disabled:text-ink-500 grid size-10 place-items-center rounded-full text-white shadow-sm transition disabled:cursor-not-allowed",
          done && "bg-success-600 hover:bg-success-600",
          className,
        )}
      >
        {done ? (
          <Check className="size-5" aria-hidden />
        ) : (
          <ShoppingCart className="size-5" aria-hidden />
        )}
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={outOfStock}
      className={cn(
        "bg-brand-600 hover:bg-brand-700 disabled:bg-ink-200 disabled:text-ink-500 inline-flex h-12 items-center justify-center gap-2 rounded-full px-6 font-semibold text-white shadow-sm transition disabled:cursor-not-allowed",
        done && "bg-success-600 hover:bg-success-600",
        className,
      )}
    >
      {done ? (
        <Check className="size-5" aria-hidden />
      ) : (
        <ShoppingCart className="size-5" aria-hidden />
      )}
      {outOfStock ? "Rupture de stock" : done ? "Ajouté !" : "Ajouter au panier"}
    </button>
  );
}
