"use client";

import { Heart } from "lucide-react";
import { useIsFavorite } from "@/components/providers/FavoritesProvider";
import { useToast } from "@/components/providers/ToastProvider";
import { cn } from "@/lib/cn";
import type { Favorite } from "@/lib/favorites";

type Props = {
  item: Omit<Favorite, "addedAt">;
  variant?: "overlay" | "inline";
  className?: string;
};

/** Cœur « ajouter aux favoris » : sur la carte produit (pastille) ou sur la fiche (bouton avec texte). */
export function FavoriteButton({ item, variant = "overlay", className }: Props) {
  const { active, toggle } = useIsFavorite(item.productId);
  const { notify } = useToast();

  function onClick() {
    const added = toggle(item);
    notify(added ? "Ajouté à vos favoris" : "Retiré de vos favoris");
  }

  const icon = (
    <Heart
      className={cn("size-5 transition", active ? "fill-brand-600 text-brand-600" : "text-ink-700")}
      aria-hidden
    />
  );

  if (variant === "inline") {
    return (
      <button
        type="button"
        onClick={onClick}
        aria-pressed={active}
        className={cn(
          "border-ink-200 hover:border-ink-900 inline-flex h-10 items-center gap-2 rounded-full border bg-white px-4 text-sm font-semibold",
          className,
        )}
      >
        {icon}
        {active ? "Dans vos favoris" : "Ajouter aux favoris"}
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      aria-label={`${active ? "Retirer" : "Ajouter"} « ${item.title} » ${active ? "des" : "aux"} favoris`}
      className={cn(
        "grid size-9 place-items-center rounded-full bg-white/95 shadow-sm ring-1 ring-black/5 hover:scale-105",
        className,
      )}
    >
      {icon}
    </button>
  );
}
