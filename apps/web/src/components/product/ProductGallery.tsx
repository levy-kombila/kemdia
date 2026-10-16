"use client";

import { ProductImage } from "@/components/ui/ProductImage";
import { useState } from "react";
import { cn } from "@/lib/cn";

export function ProductGallery({ images, title }: { images: string[]; title: string }) {
  const list = images.length > 0 ? images : ["/images/placeholder.svg"];
  const [index, setIndex] = useState(0);

  return (
    <div className="flex flex-col-reverse gap-3 sm:flex-row">
      {list.length > 1 && (
        <div className="flex gap-2 sm:flex-col" role="tablist" aria-label="Photos du produit">
          {list.map((src, i) => (
            <button
              key={src}
              type="button"
              role="tab"
              aria-selected={i === index}
              aria-label={`Photo ${i + 1}`}
              onClick={() => setIndex(i)}
              onMouseEnter={() => setIndex(i)}
              className={cn(
                "relative size-16 overflow-hidden rounded-lg border-2 bg-white transition",
                i === index ? "border-brand-600" : "border-ink-100 hover:border-ink-400",
              )}
            >
              <ProductImage src={src} alt="" fill sizes="64px" className="object-contain p-1" />
            </button>
          ))}
        </div>
      )}
      <div className="relative aspect-square flex-1 overflow-hidden rounded-xl bg-white">
        <ProductImage
          src={list[index]!}
          size="large"
          alt={title}
          fill
          preload
          sizes="(min-width: 1280px) 38vw, (min-width: 1024px) 45vw, 95vw"
          className="object-contain p-6"
        />
      </div>
    </div>
  );
}
