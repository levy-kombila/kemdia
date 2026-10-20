import { Store } from "lucide-react";
import { AddToCartButton } from "@/components/product/AddToCartButton";
import { Price } from "@/components/ui/Price";
import type { ProductDetail, Variant } from "@/lib/types";
import { otherOffers } from "@/lib/product-view";

/**
 * « Autres vendeurs » (S7.5-T03, choix du 2026-10-20) : les autres boutiques qui vendent la même déclinaison, avec
 * leur ville, leur prix, leur stock et leur propre bouton d'achat. Deux exemplaires chez deux boutiques = deux lignes
 * dans le panier (déjà séparées par boutique). Rien si une seule boutique vend ce produit.
 */
export function OtherSellers({ product, variant }: { product: ProductDetail; variant: Variant }) {
  const others = otherOffers(product, variant);
  if (others.length === 0) return null;
  return (
    <section aria-labelledby="autres-vendeurs" className="mt-3 rounded-xl bg-white p-5 sm:p-6">
      <h2 id="autres-vendeurs" className="text-lg font-bold">
        Autres vendeurs ({others.length})
      </h2>
      <p className="text-ink-500 mt-1 text-sm">
        Même produit, chez d&apos;autres boutiques partenaires de Kemdia.
      </p>
      <ul className="divide-ink-100 mt-3 divide-y">
        {others.map(({ offer, line, compareAtPrice }) => (
          <li key={offer.offerId} className="flex flex-wrap items-center gap-3 py-3">
            <Store className="text-ink-500 size-5 shrink-0" aria-hidden />
            <div className="min-w-0 flex-1">
              <p className="font-semibold">{offer.seller?.name ?? "Boutique partenaire"}</p>
              <p className="text-ink-500 text-sm">
                {offer.seller?.city ?? "Gabon"} ·{" "}
                {line.maxQuantity > 0 ? (
                  <span className="text-forest-700">En stock ({line.maxQuantity})</span>
                ) : (
                  <span>Rupture de stock</span>
                )}
              </p>
            </div>
            <Price price={line.price} oldPrice={compareAtPrice} />
            <AddToCartButton line={line} variant="icon" className="shrink-0" />
          </li>
        ))}
      </ul>
    </section>
  );
}
