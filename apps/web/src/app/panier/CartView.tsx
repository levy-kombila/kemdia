"use client";

import {
  BadgeCheck,
  CircleAlert,
  Lock,
  MapPin,
  ShoppingCart,
  Smartphone,
  Trash2,
  Truck,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useCart } from "@/components/providers/CartProvider";
import { useDeliveryLocation } from "@/components/providers/LocationProvider";
import { QuantityInput } from "@/components/product/QuantityInput";
import { Price } from "@/components/ui/Price";
import { MAX_QTY_PER_LINE, issueMessage } from "@/lib/cart";
import { estimateDelivery, formatDelay } from "@/lib/delivery";
import { formatFCFA } from "@/lib/format";

/** Barre « livraison offerte » : montre ce qu'il reste à ajouter (incite à compléter le panier). */
function FreeShippingMeter({ subtotal }: { subtotal: number }) {
  const { city, openModal } = useDeliveryLocation();
  const estimate = city ? estimateDelivery(city.id, subtotal) : null;
  if (!city || !estimate) {
    return (
      <button
        type="button"
        onClick={openModal}
        className="flex w-full items-center gap-3 rounded-xl bg-white px-5 py-3.5 text-left text-sm"
      >
        <MapPin className="text-brand-600 size-5 shrink-0" aria-hidden />
        <span className="flex-1">
          Choisissez votre ville pour connaître les frais et la date de livraison.
        </span>
        <span className="text-brand-700 font-semibold">Choisir</span>
      </button>
    );
  }
  const ratio = Math.min(1, subtotal / estimate.freeThreshold);
  return (
    <div className="rounded-xl bg-white px-5 py-3.5 text-sm">
      <p className="flex items-center gap-2">
        <Truck className="text-forest-600 size-5 shrink-0" aria-hidden />
        {estimate.remainingForFree > 0 ? (
          <span>
            Plus que <strong>{formatFCFA(estimate.remainingForFree)}</strong> pour la livraison
            offerte à {city.name}
          </span>
        ) : (
          <span>
            <strong className="text-forest-700">Livraison offerte</strong> à {city.name}
          </span>
        )}
      </p>
      <div className="bg-ink-100 mt-2 h-2 overflow-hidden rounded-full" aria-hidden>
        <div
          className="bg-forest-600 h-full rounded-full transition-[width]"
          style={{ width: `${ratio * 100}%` }}
        />
      </div>
    </div>
  );
}

export function CartView() {
  const { state, hydrated, subtotal, count, canCheckout, setQuantity, remove, clear } = useCart();
  const { city, openModal } = useDeliveryLocation();
  const estimate = city ? estimateDelivery(city.id, subtotal) : null;
  const total = subtotal + (estimate?.fee ?? 0);

  if (!hydrated) {
    return (
      <div
        key="chargement"
        className="h-[28rem] animate-pulse rounded-xl bg-white"
        aria-busy="true"
        aria-label="Chargement du panier"
      />
    );
  }

  if (state.lines.length === 0) {
    return (
      <div
        key="vide"
        className="flex flex-col items-center gap-3 rounded-xl bg-white px-6 py-14 text-center"
      >
        <span className="bg-ink-50 grid size-24 place-items-center rounded-full">
          <ShoppingCart className="text-ink-400 size-11" aria-hidden />
        </span>
        <h2 className="text-xl font-extrabold">Votre panier est vide</h2>
        <p className="text-ink-500 max-w-sm text-sm">
          Les ventes flash du jour vous attendent, et la livraison est offerte à Libreville dès 25
          000 FCFA.
        </p>
        <div className="mt-2 flex flex-wrap justify-center gap-2">
          <Link
            href="/promotions"
            className="bg-brand-600 hover:bg-brand-700 rounded-full px-6 py-3 font-semibold text-white"
          >
            Voir les ventes flash
          </Link>
          <Link
            href="/"
            className="border-ink-200 hover:border-ink-900 rounded-full border px-6 py-3 font-semibold"
          >
            Retour à l&apos;accueil
          </Link>
        </div>
      </div>
    );
  }

  // Connecté : le serveur a vérifié chaque ligne (BR-001). Une ligne signalée bloque le passage en caisse.
  const checkout = canCheckout ? (
    <Link
      href="/commande"
      className="bg-accent-400 hover:bg-accent-300 text-ink-900 flex h-12 w-full items-center justify-center gap-2 rounded-full font-bold"
    >
      <Lock className="size-4" aria-hidden /> Commander
    </Link>
  ) : (
    <button
      type="button"
      disabled
      aria-describedby="panier-a-corriger"
      className="bg-ink-200 text-ink-500 flex h-12 w-full cursor-not-allowed items-center justify-center gap-2 rounded-full font-bold"
    >
      <Lock className="size-4" aria-hidden /> Commander
    </button>
  );

  return (
    <>
      <div className="grid grid-cols-1 items-start gap-3 lg:grid-cols-[1fr_21rem]">
        <div className="space-y-3">
          <FreeShippingMeter subtotal={subtotal} />
          <section aria-labelledby="articles" className="rounded-xl bg-white">
            <div className="border-ink-100 flex items-center justify-between border-b px-5 py-3.5">
              <h2 id="articles" className="text-lg font-bold">
                Panier ({count} article{count > 1 ? "s" : ""})
              </h2>
              <button
                type="button"
                onClick={clear}
                className="text-ink-500 hover:text-brand-700 text-sm underline"
              >
                Vider le panier
              </button>
            </div>
            <ul className="divide-ink-100 divide-y">
              {state.lines.map((l) => (
                <li
                  key={l.variantId}
                  className="grid grid-cols-[5.5rem_1fr] gap-x-4 gap-y-3 p-4 sm:grid-cols-[6.5rem_1fr_auto] sm:p-5"
                >
                  <Link
                    href={`/produit/${l.slug}`}
                    className="border-ink-100 relative row-span-2 aspect-square overflow-hidden rounded-lg border bg-white sm:row-span-1"
                    tabIndex={-1}
                    aria-hidden
                  >
                    {l.image && (
                      <Image
                        src={l.image}
                        alt=""
                        fill
                        sizes="104px"
                        className="object-contain p-1.5"
                      />
                    )}
                  </Link>
                  <div className="min-w-0">
                    <Link
                      href={`/produit/${l.slug}`}
                      className="hover:text-brand-700 line-clamp-2 font-medium leading-snug"
                    >
                      {l.title}
                    </Link>
                    {l.variantName && (
                      <p className="text-ink-700 mt-0.5 text-sm">{l.variantName}</p>
                    )}
                    <p className="text-ink-500 mt-1 flex items-center gap-1 text-xs">
                      <BadgeCheck className="text-brand-600 size-3.5" aria-hidden /> Vendu par
                      Kemdia
                    </p>
                    {l.issue ? (
                      <p className="text-brand-700 mt-1 flex items-start gap-1 text-sm font-semibold">
                        <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
                        {issueMessage(l.issue)}
                      </p>
                    ) : (
                      l.maxQuantity <= 5 && (
                        <p className="text-brand-700 mt-0.5 text-xs font-semibold">
                          Plus que {l.maxQuantity} en stock
                        </p>
                      )
                    )}
                    <div className="mt-3 flex flex-wrap items-center gap-3">
                      <QuantityInput
                        value={l.quantity}
                        max={Math.max(1, Math.min(l.maxQuantity, MAX_QTY_PER_LINE))}
                        onChange={(n) => setQuantity(l.variantId, n)}
                        label={`Quantité pour ${l.title}`}
                      />
                      <button
                        type="button"
                        onClick={() => remove(l.variantId)}
                        className="text-ink-500 hover:text-brand-700 inline-flex items-center gap-1 text-sm"
                        aria-label={`Supprimer « ${l.title} » du panier`}
                      >
                        <Trash2 className="size-4" aria-hidden /> Supprimer
                      </button>
                    </div>
                  </div>
                  <div className="col-start-2 sm:col-start-3 sm:text-right">
                    <Price price={l.price * l.quantity} size="md" className="sm:items-end" />
                    {l.quantity > 1 && (
                      <p className="text-ink-500 mt-1 text-xs">
                        {formatFCFA(l.price)} l&apos;unité
                      </p>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </section>
        </div>

        <aside className="space-y-3 lg:sticky lg:top-40" aria-labelledby="recap">
          <div className="rounded-xl bg-white p-5">
            <h2 id="recap" className="mb-4 text-lg font-bold">
              Récapitulatif
            </h2>
            <dl className="space-y-2.5 text-sm">
              <div className="flex justify-between">
                <dt>Articles ({count})</dt>
                <dd className="font-semibold">{formatFCFA(subtotal)}</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt>
                  Livraison
                  {city && <span className="text-ink-500"> à {city.name}</span>}
                </dt>
                <dd className="font-semibold">
                  {estimate ? (
                    estimate.isFree ? (
                      <span className="text-forest-700">Offerte</span>
                    ) : (
                      formatFCFA(estimate.fee)
                    )
                  ) : (
                    <button type="button" onClick={openModal} className="text-brand-700 underline">
                      Choisir la ville
                    </button>
                  )}
                </dd>
              </div>
              {estimate && (
                <p className="text-ink-500 text-xs">
                  Livré en {formatDelay(estimate.daysMin, estimate.daysMax)}
                </p>
              )}
              <div className="border-ink-100 flex items-baseline justify-between border-t pt-3">
                <dt className="text-base font-bold">Total</dt>
                <dd>
                  <Price price={total} size="md" />
                </dd>
              </div>
            </dl>
            {!canCheckout && (
              <p
                id="panier-a-corriger"
                role="status"
                className="text-brand-700 mt-4 text-sm font-semibold"
              >
                Certains articles ne sont plus disponibles comme demandé : corrigez-les pour
                commander.
              </p>
            )}
            <div className="mt-4">{checkout}</div>
            <p className="text-ink-500 mt-3 text-center text-xs">
              Montants vérifiés et recalculés par nos serveurs au moment de la commande.
            </p>
          </div>
          <ul className="space-y-2 rounded-xl bg-white p-4 text-sm">
            <li className="flex items-center gap-2.5">
              <Smartphone className="text-brand-600 size-4 shrink-0" aria-hidden /> Airtel Money,
              Moov Money ou à la livraison
            </li>
            <li className="flex items-center gap-2.5">
              <Lock className="text-brand-600 size-4 shrink-0" aria-hidden /> Paiement sécurisé
            </li>
          </ul>
        </aside>
      </div>

      {/* Mobile : total et bouton toujours visibles, au-dessus de la barre d'onglets */}
      <div className="border-ink-100 fixed inset-x-0 bottom-14 z-30 flex items-center gap-3 border-t bg-white px-4 py-2.5 shadow-[0_-4px_16px_rgb(20_24_30/0.08)] lg:hidden">
        <div>
          <p className="text-ink-500 text-xs">Total</p>
          <Price price={total} size="sm" />
        </div>
        <div className="ml-auto w-48">{checkout}</div>
      </div>
    </>
  );
}
