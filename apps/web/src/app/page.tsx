import { CategoryBubbles } from "@/components/home/CategoryBubbles";
import { FlashSales } from "@/components/home/FlashSales";
import { Hero } from "@/components/home/Hero";
import { HomeBelowFold } from "@/components/home/HomeSections";
import { Newsletter } from "@/components/home/Newsletter";
import { getCurrentAccount } from "@/lib/auth/session";
import { getCategoryHighlights, getDeals, getRootCategories, listProducts } from "@/lib/catalog";

// Rendu à la demande : les liens absolus (aperçus WhatsApp) utilisent l'adresse du serveur (SITE_URL)
export const dynamic = "force-dynamic";

export default async function HomePage() {
  // Haut de la page seulement (visible à l'ouverture) : le reste arrive zone par zone (HomeSections, S3-T08)
  const [roots, cheapestTech, fashion, techShowcase, highlights, deals, current] =
    await Promise.all([
      getRootCategories(),
      listProducts({ category: "high-tech", sort: "prix-asc", pageSize: 1 }),
      listProducts({ category: "mode", pageSize: 1 }),
      listProducts({ category: "high-tech", pageSize: 2 }),
      getCategoryHighlights(12),
      getDeals(10),
      // Encart du compte (S8-T08) : même lecture que l'en-tête (une seule fois par requête, sans API sans cookie)
      getCurrentAccount(),
    ]);
  const account =
    current.status === "signed-in"
      ? {
          firstName: current.account.firstName,
          vendor: current.account.roles.includes("vendor"),
        }
      : null;

  return (
    <div className="container-page space-y-3 py-3 sm:space-y-4 lg:py-4">
      <Hero
        categories={roots}
        techDeals={techShowcase.items}
        cheapestTech={cheapestTech.items[0]?.price ?? 0}
        fashion={fashion.items}
        account={account}
      />
      <CategoryBubbles items={highlights} />
      <FlashSales deals={deals} />
      <HomeBelowFold />

      <Newsletter />
    </div>
  );
}
