"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { cn } from "@/lib/cn";

const AUTOPLAY_MS = 6000;

/**
 * Carrousel de bannières accessible : défilement automatique (en pause au survol, au focus,
 * et désactivé si l'utilisateur réduit les animations), flèches, points et balayage au doigt.
 */
export function HeroCarousel({ slides, labels }: { slides: ReactNode[]; labels: string[] }) {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const touchX = useRef<number | null>(null);
  const count = slides.length;

  const go = useCallback((i: number) => setIndex((i + count) % count), [count]);

  useEffect(() => {
    if (paused || count < 2) return;
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    const id = window.setTimeout(() => go(index + 1), AUTOPLAY_MS);
    return () => window.clearTimeout(id);
  }, [index, paused, count, go]);

  return (
    <section
      aria-roledescription="carousel"
      aria-label="Offres du moment"
      className="group/carousel relative min-w-0 overflow-hidden rounded-xl"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
      onTouchStart={(e) => {
        touchX.current = e.touches[0]?.clientX ?? null;
        setPaused(true);
      }}
      onTouchEnd={(e) => {
        const start = touchX.current;
        const end = e.changedTouches[0]?.clientX;
        if (start != null && end != null && Math.abs(end - start) > 40)
          go(index + (end < start ? 1 : -1));
        touchX.current = null;
      }}
    >
      <div
        className="flex h-full transition-transform duration-500 ease-out"
        style={{ transform: `translateX(-${index * 100}%)` }}
      >
        {slides.map((slide, i) => (
          <div
            key={labels[i]}
            role="group"
            aria-roledescription="slide"
            aria-label={`${i + 1} sur ${count} : ${labels[i]}`}
            inert={i !== index}
            className="h-full w-full shrink-0"
          >
            {slide}
          </div>
        ))}
      </div>

      {count > 1 && (
        <>
          <button
            type="button"
            onClick={() => go(index - 1)}
            aria-label="Bannière précédente"
            className="text-ink-900 absolute left-3 top-1/2 hidden size-9 -translate-y-1/2 place-items-center rounded-full bg-white/90 shadow transition-opacity focus-visible:opacity-100 md:grid md:opacity-0 md:group-hover/carousel:opacity-100"
          >
            <ChevronLeft className="size-5" aria-hidden />
          </button>
          <button
            type="button"
            onClick={() => go(index + 1)}
            aria-label="Bannière suivante"
            className="text-ink-900 absolute right-3 top-1/2 hidden size-9 -translate-y-1/2 place-items-center rounded-full bg-white/90 shadow transition-opacity focus-visible:opacity-100 md:grid md:opacity-0 md:group-hover/carousel:opacity-100"
          >
            <ChevronRight className="size-5" aria-hidden />
          </button>
          <div className="absolute inset-x-0 bottom-3 flex gap-1.5 pl-5 sm:pl-10">
            {labels.map((label, i) => (
              <button
                key={label}
                type="button"
                onClick={() => go(i)}
                aria-label={`Afficher la bannière ${i + 1} : ${label}`}
                aria-current={i === index}
                className={cn(
                  "h-2 rounded-full transition-all",
                  i === index ? "w-6 bg-white" : "w-2 bg-white/50 hover:bg-white/80",
                )}
              />
            ))}
          </div>
        </>
      )}
    </section>
  );
}
