"use client";

import { ChevronDown } from "lucide-react";
import Image from "next/image";
import { Price } from "@/components/ui/Price";
import type { CartLine } from "@/lib/cart";
import { formatFCFA } from "@/lib/format";

type Props = { lines: CartLine[]; subtotal: number; fee: number | null; total: number };

function Lines({ lines }: { lines: CartLine[] }) {
  return (
    <ul className="divide-ink-100 divide-y">
      {lines.map((l) => (
        <li key={l.variantId} className="flex items-center gap-3 py-2.5">
          <span className="border-ink-100 relative size-14 shrink-0 overflow-hidden rounded-lg border bg-white">
            {l.image && (
              <Image src={l.image} alt="" fill sizes="56px" className="object-contain p-1" />
            )}
            <span className="bg-ink-700 absolute -right-0.5 -top-0.5 grid min-w-5 place-items-center rounded-full px-1 text-[0.65rem] font-bold text-white">
              {l.quantity}
              <span className="sr-only"> exemplaire(s)</span>
            </span>
          </span>
          <span className="line-clamp-2 flex-1 text-sm">
            {l.title}
            {l.variantName && <span className="text-ink-500"> · {l.variantName}</span>}
          </span>
          <span className="whitespace-nowrap text-sm font-semibold">
            {formatFCFA(l.price * l.quantity)}
          </span>
        </li>
      ))}
    </ul>
  );
}

function Totals({ subtotal, fee, total }: Omit<Props, "lines">) {
  return (
    <dl className="space-y-2 text-sm">
      <div className="flex justify-between">
        <dt>Articles</dt>
        <dd className="font-semibold">{formatFCFA(subtotal)}</dd>
      </div>
      <div className="flex justify-between">
        <dt>Livraison</dt>
        <dd className="font-semibold">
          {fee === null ? (
            "À calculer"
          ) : fee === 0 ? (
            <span className="text-forest-700">Offerte</span>
          ) : (
            formatFCFA(fee)
          )}
        </dd>
      </div>
      <div className="border-ink-100 flex items-baseline justify-between border-t pt-3">
        <dt className="text-base font-bold">Total à payer</dt>
        <dd>
          <Price price={total} size="md" />
        </dd>
      </div>
    </dl>
  );
}

/** Récapitulatif : colonne collée sur grand écran, bloc repliable en haut sur mobile. */
export function OrderSummary(props: Props) {
  const count = props.lines.reduce((n, l) => n + l.quantity, 0);
  return (
    <>
      <details className="group rounded-xl bg-white lg:hidden">
        <summary className="flex cursor-pointer list-none items-center gap-2 px-5 py-4 [&::-webkit-details-marker]:hidden">
          <span className="text-sm font-semibold">
            Récapitulatif ({count} article{count > 1 ? "s" : ""})
          </span>
          <ChevronDown className="size-4 transition group-open:rotate-180" aria-hidden />
          <span className="ml-auto">
            <Price price={props.total} size="sm" />
          </span>
        </summary>
        <div className="px-5 pb-4">
          <Lines lines={props.lines} />
          <div className="mt-3">
            <Totals {...props} />
          </div>
        </div>
      </details>
      <aside
        aria-labelledby="recap-commande"
        className="hidden self-start rounded-xl bg-white p-5 lg:sticky lg:top-40 lg:block"
      >
        <h2 id="recap-commande" className="mb-2 text-lg font-bold">
          Votre commande
        </h2>
        <Lines lines={props.lines} />
        <div className="border-ink-100 mt-3 border-t pt-3">
          <Totals {...props} />
        </div>
      </aside>
    </>
  );
}
