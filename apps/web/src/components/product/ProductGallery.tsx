"use client";

import Image from "next/image";
import { useState } from "react";
import { cn } from "@/lib/cn";

export function ProductGallery({ images, title }: { images: string[]; title: string }) {
  const list = images.length > 0 ? images : ["/images/placeholder.svg"];
  const [index, setIndex] = useState(0);

  return (
    <div className="flex flex-col gap-3">
      <div className="relative aspect-square overflow-hidden rounded-3xl bg-white shadow-[var(--shadow-card)]">
        <Image
          src={list[index]}
          alt={title}
          fill
          preload
          sizes="(min-width: 1024px) 45vw, 95vw"
          className="object-contain p-4"
        />
      </div>
      {list.length > 1 && (
        <div className="flex gap-2" role="tablist" aria-label="Photos du produit">
          {list.map((src, i) => (
            <button
              key={src}
              type="button"
              role="tab"
              aria-selected={i === index}
              aria-label={`Photo ${i + 1}`}
              onClick={() => setIndex(i)}
              className={cn(
                "relative size-20 overflow-hidden rounded-xl border-2 bg-white transition",
                i === index
                  ? "border-brand-600"
                  : "border-transparent opacity-70 hover:opacity-100",
              )}
            >
              <Image src={src} alt="" fill sizes="80px" className="object-cover" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
