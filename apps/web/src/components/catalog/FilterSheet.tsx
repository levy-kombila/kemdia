"use client";

import { SlidersHorizontal, X } from "lucide-react";
import { useRef, type ReactNode } from "react";

/**
 * Filtres sur mobile : panneau qui monte du bas de l'écran (<dialog> natif : focus piégé, touche Échap).
 * Il reste ouvert pendant qu'on coche plusieurs filtres ; le bouton du bas affiche le nombre de résultats.
 */
export function FilterSheet({
  active,
  total,
  children,
}: {
  active: number;
  total: number;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  return (
    <>
      <button
        type="button"
        onClick={() => ref.current?.showModal()}
        className="border-ink-200 flex h-10 items-center gap-2 rounded-full border px-4 text-sm font-semibold lg:hidden"
      >
        <SlidersHorizontal className="size-4" aria-hidden /> Filtres
        {active > 0 && (
          <span className="bg-brand-600 grid size-5 place-items-center rounded-full text-xs text-white">
            {active}
            <span className="sr-only"> actif(s)</span>
          </span>
        )}
      </button>
      <dialog
        ref={ref}
        aria-labelledby="filtres-titre"
        onClick={(e) => e.target === ref.current && ref.current?.close()}
        className="backdrop:bg-ink-900/50 mb-0 mt-auto max-h-[85dvh] w-full max-w-none rounded-t-2xl p-0"
      >
        <div className="border-ink-100 sticky top-0 z-10 flex items-center justify-between border-b bg-white px-5 py-3">
          <h2 id="filtres-titre" className="text-lg font-bold">
            Filtrer
          </h2>
          <button
            type="button"
            onClick={() => ref.current?.close()}
            aria-label="Fermer les filtres"
            className="hover:bg-ink-50 rounded-full p-2"
          >
            <X className="size-5" aria-hidden />
          </button>
        </div>
        <div className="px-5 py-4">{children}</div>
        <div className="border-ink-100 sticky bottom-0 border-t bg-white px-5 py-3">
          <button
            type="button"
            onClick={() => ref.current?.close()}
            className="bg-brand-600 h-12 w-full rounded-full font-semibold text-white"
          >
            Voir {total} produit{total > 1 ? "s" : ""}
          </button>
        </div>
      </dialog>
    </>
  );
}
