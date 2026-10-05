"use client";

import { CircleCheck, CircleX, MapPin, Truck } from "lucide-react";
import { useState } from "react";
import { useDeliveryLocation } from "@/components/providers/LocationProvider";
import { MAX_QTY_PER_LINE, type CartLine } from "@/lib/cart";
import { estimateDelivery, formatDelay } from "@/lib/delivery";
import { formatFCFA } from "@/lib/format";
import { AddToCartButton } from "./AddToCartButton";
import { QuantityInput } from "./QuantityInput";

export function BuyBox({ line }: { line: Omit<CartLine, "quantity"> }) {
  const [qty, setQty] = useState(1);
  const { city, location, openModal } = useDeliveryLocation();
  const inStock = line.maxQuantity > 0;
  const max = Math.min(line.maxQuantity, MAX_QTY_PER_LINE);
  const estimate = city ? estimateDelivery(city.id, line.price * qty) : null;

  return (
    <div className="space-y-5">
      <p className="flex items-center gap-2 text-sm font-semibold">
        {inStock ? (
          <>
            <CircleCheck className="text-success-600 size-5" aria-hidden />
            <span className="text-success-600">En stock</span>
            {line.maxQuantity <= 5 && (
              <span className="text-brand-600 font-normal">
                — plus que {line.maxQuantity} disponible(s)
              </span>
            )}
          </>
        ) : (
          <>
            <CircleX className="text-brand-600 size-5" aria-hidden />
            <span className="text-brand-600">Rupture de stock</span>
          </>
        )}
      </p>

      {inStock && (
        <div className="flex flex-wrap items-center gap-3">
          <QuantityInput value={qty} max={max} onChange={setQty} />
          <AddToCartButton line={line} quantity={qty} className="flex-1" />
        </div>
      )}

      <div className="border-ink-100 bg-ink-50 rounded-2xl border p-4 text-sm">
        <div className="flex items-start gap-3">
          <Truck className="text-brand-600 mt-0.5 size-5 shrink-0" aria-hidden />
          <div className="flex-1">
            {estimate && city ? (
              <>
                <p>
                  Livraison à{" "}
                  <strong>
                    {city.name}
                    {location?.neighborhood ? ` (${location.neighborhood})` : ""}
                  </strong>{" "}
                  :{" "}
                  {estimate.isFree ? (
                    <strong className="text-success-600">gratuite</strong>
                  ) : (
                    <strong>{formatFCFA(estimate.fee)}</strong>
                  )}
                </p>
                <p className="text-ink-500">
                  Délai estimé : {formatDelay(estimate.daysMin, estimate.daysMax)}
                </p>
              </>
            ) : (
              <p>Choisissez votre ville pour connaître les frais et délais de livraison.</p>
            )}
            <button
              type="button"
              onClick={openModal}
              className="text-brand-600 mt-1 inline-flex items-center gap-1 font-semibold hover:underline"
            >
              <MapPin className="size-3.5" aria-hidden />{" "}
              {city ? "Changer de ville" : "Choisir ma ville"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
