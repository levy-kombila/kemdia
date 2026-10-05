import { Logo } from "@/components/ui/Logo";
import { getCategoryTree } from "@/lib/catalog";
import { CategoryNav, type NavCategory } from "./CategoryNav";
import { HeaderActions } from "./HeaderActions";
import { SearchForm } from "./SearchForm";
import { TopBar } from "./TopBar";

function toNav(depth: number) {
  return (c: ReturnType<typeof getCategoryTree>[number]): NavCategory => ({
    name: c.name,
    slug: c.slug,
    icon: c.icon,
    children: depth > 0 ? c.children.map(toNav(depth - 1)) : [],
  });
}

export function Header() {
  // Seuls les champs utiles au menu sont envoyés au navigateur (3 niveaux)
  const tree = getCategoryTree().map(toNav(2));
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
