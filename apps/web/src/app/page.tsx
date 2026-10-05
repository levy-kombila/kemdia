import { CategoryShowcase } from "@/components/home/CategoryShowcase";
import { Hero } from "@/components/home/Hero";
import { Newsletter } from "@/components/home/Newsletter";
import { PromoTiles } from "@/components/home/PromoTiles";
import { SectionHeader } from "@/components/home/SectionHeader";
import { ProductCard } from "@/components/product/ProductCard";
import { ProductRail, RailItem } from "@/components/product/ProductRail";
import {
  countProducts,
  getBestsellers,
  getDeals,
  getFeaturedProducts,
  getNewProducts,
  getRootCategories,
  queryProducts,
} from "@/lib/catalog";

export default function HomePage() {
  const featured = getFeaturedProducts(10);
  const news = getNewProducts(10);
  const bestsellers = getBestsellers(10);
  const deals = getDeals(6);
  const popular = getRootCategories().map((c) => ({ ...c, count: countProducts(c.id) }));
  const all = queryProducts({ pageSize: 12 }).items;

  return (
    <div className="container-page space-y-12 py-6 lg:py-8">
      <Hero showcase={[...featured, ...bestsellers]} />
      <PromoTiles deals={deals} news={news} />
      <CategoryShowcase categories={popular} />

      <section aria-labelledby="vedette">
        <SectionHeader
          id="vedette"
          title="Produits"
          highlight="en vedette"
          subtitle="Les articles les plus populaires du moment"
          href="/recherche"
        />
        <ProductRail label="Produits en vedette">
          {featured.map((p) => (
            <RailItem key={p.id}>
              <ProductCard product={p} badge="featured" />
            </RailItem>
          ))}
        </ProductRail>
      </section>

      <section aria-labelledby="nouveautes">
        <SectionHeader
          id="nouveautes"
          title="Les derniers"
          highlight="arrivages"
          subtitle="Nos nouveaux produits fraîchement arrivés"
          href="/recherche?tri=nouveautes"
        />
        <ProductRail label="Nouveautés">
          {news.map((p) => (
            <RailItem key={p.id}>
              <ProductCard product={p} badge="new" />
            </RailItem>
          ))}
        </ProductRail>
      </section>

      <section aria-labelledby="meilleures-ventes">
        <SectionHeader
          id="meilleures-ventes"
          title="Meilleures"
          highlight="ventes"
          href="/recherche?tri=note"
        />
        <ProductRail label="Meilleures ventes">
          {bestsellers.map((p, i) => (
            <RailItem key={p.id}>
              <ProductCard product={p} badge="bestseller" rank={i < 3 ? i + 1 : undefined} />
            </RailItem>
          ))}
        </ProductRail>
      </section>

      <section aria-labelledby="tous-produits">
        <SectionHeader id="tous-produits" title="Tous nos" highlight="produits" href="/recherche" />
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
          {all.map((p) => (
            <ProductCard key={p.id} product={p} />
          ))}
        </div>
      </section>

      <Newsletter />
    </div>
  );
}
