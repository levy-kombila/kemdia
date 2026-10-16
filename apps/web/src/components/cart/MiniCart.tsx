"use client";

import { ShoppingCart, Trash2 } from "lucide-react";
import { ProductImage } from "@/components/ui/ProductImage";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useCart } from "@/components/providers/CartProvider";
import { formatFCFA, truncate } from "@/lib/format";

export function MiniCart() {
  const { state, count, subtotal, remove } = useCart();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const closeTimer = useRef<number | undefined>(undefined);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onClick);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onClick);
    };
  }, [open]);

  return (
    <div
      ref={ref}
      className="relative"
      onMouseEnter={() => {
        window.clearTimeout(closeTimer.current);
        setOpen(true);
      }}
      onMouseLeave={() => {
        closeTimer.current = window.setTimeout(() => setOpen(false), 200);
      }}
    >
      <Link
        href="/panier"
        className="hover:bg-ink-50 flex items-center gap-2 rounded-lg px-2 py-1"
        aria-label={`Panier : ${count} article${count > 1 ? "s" : ""}`}
      >
        <span className="relative">
          <ShoppingCart className="text-ink-900 size-6" aria-hidden />
          <span
            key={count}
            className="bg-brand-600 absolute -right-2.5 -top-2 grid h-5 min-w-5 animate-[pulse_0.4s_ease-in-out_1] place-items-center rounded-full px-1 text-[0.65rem] font-bold text-white"
          >
            {count > 99 ? "99+" : count}
          </span>
        </span>
        <span className="hidden leading-tight lg:block">
          <span className="text-ink-500 block text-[0.7rem]">Panier</span>
          <span className="block text-sm font-bold">{formatFCFA(subtotal)}</span>
        </span>
      </Link>

      {open && (
        <div className="absolute right-0 top-full z-50 hidden w-96 pt-2 lg:block">
          <div className="border-ink-100 overflow-hidden rounded-2xl border bg-white shadow-[var(--shadow-card-hover)]">
            <div className="border-ink-100 flex items-center justify-between border-b px-4 py-3">
              <p className="font-display font-bold">
                Mon panier <span className="text-ink-500">({count})</span>
              </p>
              <Link href="/panier" className="text-brand-600 text-sm font-medium hover:underline">
                Voir tout
              </Link>
            </div>
            {state.lines.length === 0 ? (
              <div className="text-ink-500 flex flex-col items-center gap-3 px-4 py-8 text-center text-sm">
                <ShoppingCart className="text-ink-200 size-10" aria-hidden />
                <p>Votre panier est vide</p>
                <Link
                  href="/"
                  className="bg-brand-600 rounded-full px-4 py-2 font-semibold text-white"
                >
                  Découvrir nos produits
                </Link>
              </div>
            ) : (
              <>
                <ul className="divide-ink-100 max-h-80 divide-y overflow-y-auto">
                  {state.lines.map((l) => (
                    <li key={l.variantId} className="flex items-center gap-3 px-4 py-3">
                      <div className="bg-ink-100 relative size-14 shrink-0 overflow-hidden rounded-lg">
                        {l.image && (
                          <ProductImage
                            src={l.image}
                            alt=""
                            fill
                            sizes="56px"
                            className="object-cover"
                          />
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <Link
                          href={`/produit/${l.slug}`}
                          className="hover:text-brand-600 block text-sm font-medium"
                        >
                          {truncate(l.title, 40)}
                        </Link>
                        <p className="text-ink-500 text-xs">
                          {l.quantity} × {formatFCFA(l.price)}
                        </p>
                        {l.issue && (
                          <p className="text-brand-700 text-xs font-semibold">À vérifier</p>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={() => remove(l.variantId)}
                        className="text-ink-400 hover:bg-brand-50 hover:text-brand-600 rounded p-1.5"
                        aria-label={`Retirer « ${l.title} » du panier`}
                      >
                        <Trash2 className="size-4" />
                      </button>
                    </li>
                  ))}
                </ul>
                <div className="border-ink-100 bg-ink-50 border-t px-4 py-3">
                  <div className="mb-3 flex justify-between text-sm">
                    <span>Sous-total</span>
                    <span className="font-bold">{formatFCFA(subtotal)}</span>
                  </div>
                  <Link
                    href="/panier"
                    className="bg-brand-600 hover:bg-brand-700 block rounded-full py-2.5 text-center text-sm font-semibold text-white"
                  >
                    Voir le panier
                  </Link>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
