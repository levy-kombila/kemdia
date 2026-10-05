"use client";

import { Info, Lock, MapPin, ShoppingCart, Trash2 } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useCart } from "@/components/providers/CartProvider";
import { useDeliveryLocation } from "@/components/providers/LocationProvider";
import { QuantityInput } from "@/components/product/QuantityInput";
import { MAX_QTY_PER_LINE } from "@/lib/cart";
import { estimateDelivery, formatDelay } from "@/lib/delivery";
import { formatFCFA } from "@/lib/format";

export function CartView() {
  const { state, hydrated, subtotal, count, setQuantity, remove, clear } = useCart();
  const { city, openModal } = useDeliveryLocation();
  const estimate = city ? estimateDelivery(city.id, subtotal) : null;
  const total = subtotal + (estimate?.fee ?? 0);

  if (!hydrated) {
    return (
      <div
        className="h-64 animate-pulse rounded-3xl bg-white"
        aria-busy="true"
        aria-label="Chargement du panier"
      />
    );
  }

  if (state.lines.length === 0) {
    return (
      <div className="flex flex-col items-center gap-4 rounded-3xl bg-white px-6 py-16 text-center shadow-[var(--shadow-card)]">
        <ShoppingCart className="text-ink-200 size-14" aria-hidden />
        <h2 className="text-xl font-bold">Votre panier est vide</h2>
        <p className="text-ink-500 max-w-sm text-sm">
          Parcourez nos catégories et ajoutez vos coups de cœur.
        </p>
        <Link
          href="/"
          className="bg-brand-600 hover:bg-brand-700 rounded-full px-6 py-3 font-semibold text-white"
        >
          Continuer mes achats
        </Link>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-[1fr_22rem]">
      <section
        aria-label="Articles du panier"
        className="rounded-3xl bg-white shadow-[var(--shadow-card)]"
      >
        <div className="border-ink-100 flex items-center justify-between border-b px-5 py-4">
          <h2 className="font-bold">
            {count} article{count > 1 ? "s" : ""}
          </h2>
          <button
            type="button"
            onClick={clear}
            className="text-ink-500 hover:text-brand-600 text-sm"
          >
            Vider le panier
          </button>
        </div>
        <ul className="divide-ink-100 divide-y">
          {state.lines.map((l) => (
            <li key={l.productId} className="flex gap-4 p-5">
              <Link
                href={`/produit/${l.slug}`}
                className="bg-ink-100 relative size-24 shrink-0 overflow-hidden rounded-2xl"
                tabIndex={-1}
                aria-hidden
              >
                {l.image && (
                  <Image src={l.image} alt="" fill sizes="96px" className="object-cover" />
                )}
              </Link>
              <div className="flex min-w-0 flex-1 flex-col gap-2 sm:flex-row sm:items-center">
                <div className="min-w-0 flex-1">
                  <Link
                    href={`/produit/${l.slug}`}
                    className="hover:text-brand-600 line-clamp-2 font-semibold"
                  >
                    {l.title}
                  </Link>
                  <p className="text-ink-500 text-sm">{formatFCFA(l.price)} / unité</p>
                </div>
                <QuantityInput
                  value={l.quantity}
                  max={Math.min(l.maxQuantity, MAX_QTY_PER_LINE)}
                  onChange={(n) => setQuantity(l.productId, n)}
                  label={`Quantité pour ${l.title}`}
                />
                <p className="font-display w-32 font-bold sm:text-right">
                  {formatFCFA(l.price * l.quantity)}
                </p>
              </div>
              <button
                type="button"
                onClick={() => remove(l.productId)}
                className="text-ink-400 hover:bg-brand-50 hover:text-brand-600 h-fit rounded-lg p-2"
                aria-label={`Retirer « ${l.title} »`}
              >
                <Trash2 className="size-5" />
              </button>
            </li>
          ))}
        </ul>
      </section>

      <aside className="space-y-4 lg:sticky lg:top-40" aria-label="Récapitulatif">
        <div className="rounded-3xl bg-white p-5 shadow-[var(--shadow-card)]">
          <h2 className="mb-4 text-lg font-bold">Récapitulatif</h2>
          <dl className="space-y-2 text-sm">
            <div className="flex justify-between">
              <dt>Sous-total</dt>
              <dd className="font-semibold">{formatFCFA(subtotal)}</dd>
            </div>
            <div className="flex justify-between">
              <dt>Livraison {city && <span className="text-ink-500">({city.name})</span>}</dt>
              <dd className="font-semibold">
                {estimate ? (
                  estimate.isFree ? (
                    <span className="text-success-600">Gratuite</span>
                  ) : (
                    formatFCFA(estimate.fee)
                  )
                ) : (
                  "—"
                )}
              </dd>
            </div>
            {estimate && (
              <p className="text-ink-500 text-xs">
                Délai estimé : {formatDelay(estimate.daysMin, estimate.daysMax)}
              </p>
            )}
            {estimate && estimate.remainingForFree > 0 && (
              <p className="bg-success-600/10 text-success-600 rounded-lg px-3 py-2 text-xs">
                Plus que <strong>{formatFCFA(estimate.remainingForFree)}</strong> pour la livraison
                gratuite !
              </p>
            )}
            <div className="border-ink-100 flex justify-between border-t pt-3 text-base">
              <dt className="font-bold">Total estimé</dt>
              <dd className="font-display text-brand-600 text-xl font-extrabold">
                {formatFCFA(total)}
              </dd>
            </div>
          </dl>

          {!city && (
            <button
              type="button"
              onClick={openModal}
              className="border-brand-600 text-brand-600 hover:bg-brand-50 mt-4 flex w-full items-center justify-center gap-2 rounded-full border py-2.5 text-sm font-semibold"
            >
              <MapPin className="size-4" aria-hidden /> Choisir ma ville de livraison
            </button>
          )}

          <button
            type="button"
            disabled
            className="bg-ink-200 text-ink-500 mt-3 flex h-12 w-full cursor-not-allowed items-center justify-center gap-2 rounded-full font-semibold"
            title="Le tunnel de commande arrive dans une prochaine version"
          >
            <Lock className="size-4" aria-hidden /> Commander — bientôt disponible
          </button>
        </div>
        <p className="text-ink-500 flex gap-2 px-2 text-xs">
          <Info className="size-4 shrink-0" aria-hidden />
          Les prix et frais affichés sont indicatifs : ils seront vérifiés et recalculés par nos
          serveurs au moment de la commande.
        </p>
      </aside>
    </div>
  );
}
