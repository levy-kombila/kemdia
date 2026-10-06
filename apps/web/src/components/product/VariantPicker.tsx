import Link from "next/link";
import { cn } from "@/lib/cn";
import { formatFCFA } from "@/lib/format";
import type { Variant } from "@/lib/types";

/**
 * Choix de la variante (couleur, taille… — FR-013) : de simples liens `?variante=<référence>`.
 * La page est recalculée par le serveur : prix, stock et bouton « Ajouter au panier » suivent la variante.
 * Affiché seulement quand il y a vraiment un choix (au moins deux variantes).
 */
export function VariantPicker({
  slug,
  variants,
  selectedId,
}: {
  slug: string;
  variants: Variant[];
  selectedId: string;
}) {
  if (variants.length < 2) return null;
  const prices = new Set(variants.map((v) => v.price));
  return (
    <fieldset className="mt-4">
      <legend className="text-ink-700 mb-2 text-sm font-semibold">Choisissez une option</legend>
      <ul className="flex flex-wrap gap-2">
        {variants.map((v) => {
          const selected = v.id === selectedId;
          return (
            <li key={v.id}>
              <Link
                href={`/produit/${slug}?variante=${encodeURIComponent(v.sku)}`}
                replace
                scroll={false}
                aria-current={selected ? "true" : undefined}
                className={cn(
                  "flex min-h-11 flex-col justify-center rounded-lg border-2 px-3 py-1.5 text-sm",
                  selected
                    ? "border-brand-600 bg-brand-50 text-brand-800 font-semibold"
                    : "border-ink-200 hover:border-ink-400",
                  !v.available && "text-ink-500 line-through decoration-1",
                )}
              >
                <span>{v.name}</span>
                {prices.size > 1 && (
                  <span className="text-xs font-normal">{formatFCFA(v.price)}</span>
                )}
                {!v.available && <span className="sr-only"> (rupture de stock)</span>}
              </Link>
            </li>
          );
        })}
      </ul>
    </fieldset>
  );
}
