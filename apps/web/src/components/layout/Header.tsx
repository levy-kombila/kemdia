import { unstable_rethrow } from "next/navigation";
import { Logo } from "@/components/ui/Logo";
import { getCurrentAccount } from "@/lib/auth/session";
import { CatalogUnavailableError, getCategoryTree, type CategoryNode } from "@/lib/catalog";
import { StaleSessionCleaner, type HeaderAccount } from "./AccountMenu";
import { CategoryNav, type NavCategory } from "./CategoryNav";
import { HeaderActions } from "./HeaderActions";
import { SearchForm } from "./SearchForm";
import { TopBar } from "./TopBar";
import { log } from "@/lib/log";

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
    log.error("en-tête", `menu des catégories indisponible : ${(error as Error).message}`);
    return [];
  }
}

function HeaderShell({ account, tree }: { account: HeaderAccount; tree: NavCategory[] }) {
  return (
    <>
      <TopBar />
      <header className="sticky top-0 z-50 shadow-sm">
        <div className="border-ink-100 border-b bg-white">
          <div className="container-page flex h-16 items-center gap-4 lg:h-20 lg:gap-8">
            <Logo className="shrink-0" />
            <SearchForm className="hidden max-w-2xl flex-1 md:block" />
            <div className="ml-auto">
              <HeaderActions account={account} />
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

/**
 * En-tête envoyé TOUT DE SUITE pendant que le vrai attend l'API (S4-T08, `<Suspense>` du layout, DÉMO seulement) : même hauteur,
 * recherche et panier utilisables, menu des catégories et compte réservés. Sur la démo endormie, le visiteur voit
 * donc le site et l'écran « La boutique se réveille » au lieu d'une page blanche.
 */
export function HeaderFallback() {
  return <HeaderShell account="loading" tree={[]} />;
}

export async function Header() {
  // Seuls les champs utiles au menu sont envoyés au navigateur (3 niveaux)
  // Menu et compte lus en parallèle ; seuls le prénom et deux oui/non (espaces vendeur, équipe) vont au navigateur
  const [tree, current] = await Promise.all([navigationTree(), getCurrentAccount()]);
  const roles = current.status === "signed-in" ? current.account.roles : [];
  const account: HeaderAccount =
    current.status === "signed-in"
      ? {
          firstName: current.account.firstName,
          vendor: roles.includes("vendor"),
          staff: roles.includes("admin") || roles.includes("moderator"),
        }
      : null;
  return (
    <>
      {current.status === "stale" && <StaleSessionCleaner />}
      <HeaderShell account={account} tree={tree} />
    </>
  );
}
