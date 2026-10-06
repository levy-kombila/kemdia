import { unstable_rethrow } from "next/navigation";
import { Logo } from "@/components/ui/Logo";
import { CatalogUnavailableError, getCategoryTree, type CategoryNode } from "@/lib/catalog";
import { CategoryNav, type NavCategory } from "./CategoryNav";
import { HeaderActions } from "./HeaderActions";
import { SearchForm } from "./SearchForm";
import { TopBar } from "./TopBar";

function toNav(depth: number) {
  return (c: CategoryNode): NavCategory => ({
    name: c.name,
    slug: c.slug,
    icon: c.icon,
    children: depth > 0 ? c.children.map(toNav(depth - 1)) : [],
  });
}

/**
 * Menu des catégories : sans lui, le site reste utilisable (recherche, panier). Si le catalogue ne répond pas,
 * l'en-tête s'affiche sans menu et la page elle-même montre la page d'erreur (aucune donnée de secours).
 */
async function navigationTree(): Promise<NavCategory[]> {
  try {
    return (await getCategoryTree()).map(toNav(2));
  } catch (error) {
    // Seule la panne du catalogue est tolérée ici. Tout le reste remonte : signaux internes de Next.js
    // (rendu à la demande), garde de construction, configuration invalide.
    unstable_rethrow(error);
    if (!(error instanceof CatalogUnavailableError)) throw error;
    console.error("[en-tête] menu des catégories indisponible :", (error as Error).message);
    return [];
  }
}

export async function Header() {
  // Seuls les champs utiles au menu sont envoyés au navigateur (3 niveaux)
  const tree = await navigationTree();
  return (
    <>
      <TopBar />
      <header className="sticky top-0 z-50 shadow-sm">
        <div className="border-ink-100 border-b bg-white">
          <div className="container-page flex h-16 items-center gap-4 lg:h-20 lg:gap-8">
            <Logo className="shrink-0" />
            <SearchForm className="hidden max-w-2xl flex-1 md:block" />
            <div className="ml-auto">
              <HeaderActions />
            </div>
          </div>
          <div className="container-page pb-3 md:hidden">
            <SearchForm id="site-search-mobile" />
          </div>
        </div>
        <CategoryNav tree={tree} />
      </header>
    </>
  );
}
