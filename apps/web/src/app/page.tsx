import { CategoryBubbles } from "@/components/home/CategoryBubbles";
import { CategoryTiles } from "@/components/home/CategoryTiles";
import { FlashSales } from "@/components/home/FlashSales";
import { Hero } from "@/components/home/Hero";
import { Newsletter } from "@/components/home/Newsletter";
import { SectionHeader } from "@/components/home/SectionHeader";
import { ProductCard } from "@/components/product/ProductCard";
import { ProductRail, RailItem } from "@/components/product/ProductRail";
import {
  getBestsellers,
  getCategoryBySlug,
  getCategoryHighlights,
  getCategoryTiles,
  getDeals,
  getFeaturedProducts,
  getNewProducts,
  getRootCategories,
  queryProducts,
} from "@/lib/catalog";

function railSection(id: string, title: string, href: string, children: React.ReactNode) {
  return (
    <section aria-labelledby={id} className="rounded-xl bg-white px-3 pb-3 pt-4 sm:px-5">
      <SectionHeader id={id} title={title} href={href} />
      {children}
    </section>
  );
}

export default function HomePage() {
  const tech = getCategoryBySlug("high-tech");
  const mode = getCategoryBySlug("mode");
  const techItems = tech
    ? queryProducts({ categoryId: tech.id, sort: "prix-asc", pageSize: 50 }).items
    : [];
  const fashion = mode ? queryProducts({ categoryId: mode.id, pageSize: 1 }).items : [];
  const techShowcase = tech ? queryProducts({ categoryId: tech.id, pageSize: 2 }).items : [];

  const featured = getFeaturedProducts(12);
  const news = getNewProducts(12);
  const bestsellers = getBestsellers(12);
  const more = queryProducts({ pageSize: 18, sort: "nouveautes" }).items;

  return (
    <div className="container-page space-y-3 py-3 sm:space-y-4 lg:py-4">
      <Hero
        categories={getRootCategories()}
        techDeals={techShowcase}
        cheapestTech={techItems[0]?.price ?? 0}
        fashion={fashion}
      />
      <CategoryBubbles items={getCategoryHighlights(12)} />
      <FlashSales deals={getDeals(12)} />
      <CategoryTiles tiles={getCategoryTiles()} />

      {railSection(
        "meilleures-ventes",
        "Les plus vendus",
        "/recherche?tri=note",
        <ProductRail label="Les plus vendus">
          {bestsellers.map((p, i) => (
            <RailItem key={p.id}>
              <ProductCard product={p} badge="bestseller" rank={i < 3 ? i + 1 : undefined} />
            </RailItem>
          ))}
        </ProductRail>,
      )}

      {railSection(
        "vedette",
        "Choisis pour vous",
        "/recherche",
        <ProductRail label="Choisis pour vous">
          {featured.map((p) => (
            <RailItem key={p.id}>
              <ProductCard product={p} />
            </RailItem>
          ))}
        </ProductRail>,
      )}

      {railSection(
        "nouveautes",
        "Nouveautés de la semaine",
        "/recherche?tri=nouveautes",
        <ProductRail label="Nouveautés">
          {news.map((p) => (
            <RailItem key={p.id}>
              <ProductCard product={p} badge="new" />
            </RailItem>
          ))}
        </ProductRail>,
      )}

      <section aria-labelledby="tous-produits" className="pt-2">
        <SectionHeader id="tous-produits" title="Encore plus de produits" href="/recherche" />
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 sm:gap-3 lg:grid-cols-5 xl:grid-cols-6">
          {more.map((p) => (
            <ProductCard key={p.id} product={p} />
          ))}
        </div>
      </section>

      <Newsletter />
    </div>
  );
}
