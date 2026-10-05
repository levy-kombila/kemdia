"use client";

import { Minus, Plus } from "lucide-react";

export function QuantityInput({
  value,
  max,
  onChange,
  label = "Quantité",
}: {
  value: number;
  max: number;
  onChange: (n: number) => void;
  label?: string;
}) {
  const clamp = (n: number) => Math.max(1, Math.min(max, Number.isFinite(n) ? Math.floor(n) : 1));
  return (
    <div className="border-ink-200 inline-flex h-11 items-center rounded-full border bg-white">
      <button
        type="button"
        onClick={() => onChange(clamp(value - 1))}
        disabled={value <= 1}
        className="text-ink-700 hover:text-brand-600 disabled:text-ink-200 grid size-11 place-items-center rounded-full"
        aria-label="Diminuer la quantité"
      >
        <Minus className="size-4" />
      </button>
      <input
        type="number"
        inputMode="numeric"
        min={1}
        max={max}
        value={value}
        aria-label={label}
        onChange={(e) => onChange(clamp(Number(e.target.value)))}
        className="w-12 bg-transparent text-center font-semibold [appearance:textfield] focus:outline-none [&::-webkit-inner-spin-button]:appearance-none"
      />
      <button
        type="button"
        onClick={() => onChange(clamp(value + 1))}
        disabled={value >= max}
        className="text-ink-700 hover:text-brand-600 disabled:text-ink-200 grid size-11 place-items-center rounded-full"
        aria-label="Augmenter la quantité"
      >
        <Plus className="size-4" />
      </button>
    </div>
  );
}
