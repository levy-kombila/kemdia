"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { useRef } from "react";

/**
 * Carrousel horizontal léger (scroll natif + scroll-snap) : remplace Swiper.js
 * (≈ 140 Ko) et le JS de slide() de l'ancien index.html. Fonctionne au doigt sur mobile.
 */
export function ProductRail({ children, label }: { children: React.ReactNode; label: string }) {
  const ref = useRef<HTMLDivElement>(null);

  function scroll(dir: -1 | 1) {
    const el = ref.current;
    if (!el) return;
    el.scrollBy({ left: dir * el.clientWidth * 0.8, behavior: "smooth" });
  }

  return (
    <div className="relative">
      <div
        ref={ref}
        role="region"
        aria-label={label}
        tabIndex={0}
        className="scrollbar-none -mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-2 sm:mx-0 sm:px-0"
      >
        {children}
      </div>
      <button
        type="button"
        onClick={() => scroll(-1)}
        aria-label="Produits précédents"
        className="text-ink-900 hover:text-brand-600 absolute -left-4 top-1/3 hidden size-10 place-items-center rounded-full bg-white shadow-[var(--shadow-card-hover)] md:grid"
      >
        <ChevronLeft className="size-5" />
      </button>
      <button
        type="button"
        onClick={() => scroll(1)}
        aria-label="Produits suivants"
        className="text-ink-900 hover:text-brand-600 absolute -right-4 top-1/3 hidden size-10 place-items-center rounded-full bg-white shadow-[var(--shadow-card-hover)] md:grid"
      >
        <ChevronRight className="size-5" />
      </button>
    </div>
  );
}

export function RailItem({
  children,
  size = "md",
}: {
  children: React.ReactNode;
  size?: "sm" | "md";
}) {
  return (
    <div
      className={
        size === "sm"
          ? "w-[40%] shrink-0 snap-start sm:w-[24%] lg:w-[15.8%]"
          : "w-[46%] shrink-0 snap-start sm:w-[31%] lg:w-[19%] xl:w-[15.8%]"
      }
    >
      {children}
    </div>
  );
}
