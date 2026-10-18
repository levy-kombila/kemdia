"use client";

import {
  BadgeCheck,
  CircleCheck,
  CircleX,
  MapPin,
  RotateCcw,
  Smartphone,
  Truck,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useDeliveryLocation } from "@/components/providers/LocationProvider";
import { MAX_QTY_PER_LINE, type CartLine } from "@/lib/cart";
import { useDeliveryEstimate } from "@/components/providers/DeliveryTariffsProvider";
import { deliveryWindow } from "@/lib/delivery";
import { formatFCFA } from "@/lib/format";
import { AddToCartButton } from "./AddToCartButton";
import { QuantityInput } from "./QuantityInput";

/** Encadré d'achat : livraison datée selon la ville, stock, quantité, deux boutons d'achat, garanties. */
export function BuyBox({ line }: { line: Omit<CartLine, "quantity"> }) {
  const router = useRouter();
  const [qty, setQty] = useState(1);
  const { city, location, openModal } = useDeliveryLocation();
  const inStock = line.maxQuantity > 0;
  const max = Math.min(line.maxQuantity, MAX_QTY_PER_LINE);
  const estimateDelivery = useDeliveryEstimate();
  const estimate = city ? estimateDelivery(city.id, line.price * qty) : null;

  return (
    <div className="space-y-4 text-sm">
      <div className="flex items-start gap-3">
        <Truck className="text-forest-600 mt-0.5 size-5 shrink-0" aria-hidden />
        <div className="flex-1">
          {estimate && city ? (
            <>
              <p className="text-base">
                Livraison{" "}
                {estimate.isFree ? (
                  <strong className="text-forest-700">offerte</strong>
                ) : (
                  <strong>{formatFCFA(estimate.fee)}</strong>
                )}
              </p>
              <p>
                Livraison prévue{" "}
                <strong>{deliveryWindow(new Date(), estimate.daysMin, estimate.daysMax)}</strong> à{" "}
                {city.name}
                {location?.neighborhood ? ` (${location.neighborhood})` : ""}
              </p>
              {!estimate.isFree && (
                <p className="text-ink-500">
                  Offerte dès {formatFCFA(estimate.freeThreshold)} d&apos;achat
                </p>
              )}
            </>
          ) : (
            <p className="text-base">
              Choisissez votre ville pour voir le prix et la date de livraison.
            </p>
          )}
          <button
            type="button"
            onClick={openModal}
            className="text-brand-700 mt-1 inline-flex items-center gap-1 font-semibold hover:underline"
          >
            <MapPin className="size-3.5" aria-hidden />{" "}
            {city ? "Changer de ville" : "Choisir ma ville"}
          </button>
        </div>
      </div>

      <p className="flex items-center gap-2 text-base font-semibold">
        {inStock ? (
          <>
            <CircleCheck className="text-forest-600 size-5" aria-hidden />
            <span className="text-forest-700">En stock</span>
            {line.maxQuantity <= 5 && (
              <span className="text-brand-700 text-sm font-semibold">
                plus que {line.maxQuantity}
              </span>
            )}
          </>
        ) : (
          <>
            <CircleX className="text-brand-600 size-5" aria-hidden />
            <span className="text-brand-700">Rupture de stock</span>
          </>
        )}
      </p>

      {inStock && (
        <div className="space-y-2.5">
          <QuantityInput value={qty} max={max} onChange={setQty} />
          <AddToCartButton line={line} quantity={qty} className="w-full" />
          <AddToCartButton
            line={line}
            quantity={qty}
            tone="secondary"
            label="Acheter maintenant"
            className="w-full"
            onAdded={() => router.push("/panier")}
          />
        </div>
      )}

      <ul className="border-ink-100 divide-ink-100 divide-y rounded-lg border">
        <li className="flex items-center gap-2.5 px-3 py-2.5">
          <BadgeCheck className="text-brand-600 size-5 shrink-0" aria-hidden />
          <span>
            Vendu et expédié par <strong>Kemdia</strong>
          </span>
        </li>
        <li className="flex items-center gap-2.5 px-3 py-2.5">
          <Smartphone className="text-brand-600 size-5 shrink-0" aria-hidden />
          Airtel Money, Moov Money ou à la livraison
        </li>
        <li className="flex items-center gap-2.5 px-3 py-2.5">
          <RotateCcw className="text-brand-600 size-5 shrink-0" aria-hidden />
          Retour gratuit sous 14 jours
        </li>
      </ul>
    </div>
  );
}
