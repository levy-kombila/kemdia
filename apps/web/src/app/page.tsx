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
  getCategoryHighlights,
  getCategoryTiles,
  getDeals,
  getFeaturedProducts,
  getNewProducts,
  getRootCategories,
  listProducts,
} from "@/lib/catalog";

// Rendu à la demande : les liens absolus (aperçus WhatsApp) utilisent l'adresse du serveur (SITE_URL)
export const dynamic = "force-dynamic";

function railSection(id: string, title: string, href: string, children: React.ReactNode) {
  return (
    <section aria-labelledby={id} className="rounded-xl bg-white px-3 pb-3 pt-4 sm:px-5">
      <SectionHeader id={id} title={title} href={href} />
      {children}
    </section>
  );
}

export default async function HomePage() {
  // Toutes les lectures partent en même temps (catalogue mis en cache 60 s côté serveur)
  const [
    roots,
    cheapestTech,
    fashion,
    techShowcase,
    highlights,
    deals,
    tiles,
    featured,
    news,
    bestsellers,
    more,
  ] = await Promise.all([
    getRootCategories(),
    listProducts({ category: "high-tech", sort: "prix-asc", pageSize: 1 }),
    listProducts({ category: "mode", pageSize: 1 }),
    listProducts({ category: "high-tech", pageSize: 2 }),
    getCategoryHighlights(12),
    getDeals(10),
    getCategoryTiles(),
    getFeaturedProducts(10),
    getNewProducts(10),
    getBestsellers(10),
    listProducts({ pageSize: 12, sort: "nouveautes" }),
  ]);

  return (
    <div className="container-page space-y-3 py-3 sm:space-y-4 lg:py-4">
      <Hero
        categories={roots}
        techDeals={techShowcase.items}
        cheapestTech={cheapestTech.items[0]?.price ?? 0}
        fashion={fashion.items}
      />
      <CategoryBubbles items={highlights} />
      <FlashSales deals={deals} />
      <CategoryTiles tiles={tiles} />

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
          {more.items.map((p) => (
            <ProductCard key={p.id} product={p} />
          ))}
        </div>
      </section>

      <Newsletter />
    </div>
  );
}
