import type { Metadata } from "next";
import { Breadcrumbs } from "@/components/catalog/Breadcrumbs";
import { SectionHeader } from "@/components/home/SectionHeader";
import { ProductCard } from "@/components/product/ProductCard";
import { ProductRail, RailItem } from "@/components/product/ProductRail";
import { getBestsellers } from "@/lib/catalog";
import { CartView } from "./CartView";

export const metadata: Metadata = { title: "Mon panier", robots: { index: false } };

export default function CartPage() {
  return (
    <div className="container-page space-y-3 py-4 pb-24 lg:pb-4">
      <Breadcrumbs items={[{ label: "Panier" }]} />
      <h1 className="sr-only">Mon panier</h1>
      <CartView />
      <section aria-labelledby="suggestions" className="rounded-xl bg-white px-3 pb-3 pt-4 sm:px-5">
        <SectionHeader
          id="suggestions"
          title="Souvent achetés en ce moment"
          href="/recherche?tri=note"
        />
        <ProductRail label="Suggestions">
          {getBestsellers(12).map((p) => (
            <RailItem key={p.id}>
              <ProductCard product={p} />
            </RailItem>
          ))}
        </ProductRail>
      </section>
    </div>
  );
}
