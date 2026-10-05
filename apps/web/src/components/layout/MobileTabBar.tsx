"use client";

import { House, LayoutGrid, ShoppingCart, Tag, UserRound } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCart } from "@/components/providers/CartProvider";
import { cn } from "@/lib/cn";

const TABS = [
  { href: "/", label: "Accueil", icon: House, match: (p: string) => p === "/" },
  {
    href: "/categories",
    label: "Rayons",
    icon: LayoutGrid,
    match: (p: string) => p.startsWith("/categ"),
  },
  {
    href: "/promotions",
    label: "Promos",
    icon: Tag,
    match: (p: string) => p.startsWith("/promotions"),
  },
  {
    href: "/panier",
    label: "Panier",
    icon: ShoppingCart,
    match: (p: string) => p.startsWith("/panier"),
  },
  {
    href: "/compte",
    label: "Compte",
    icon: UserRound,
    match: (p: string) =>
      ["/compte", "/connexion", "/inscription", "/mot-de-passe-oublie"].some((r) =>
        p.startsWith(r),
      ),
  },
];

/** Barre d'onglets en bas de l'écran (mobile), comme dans une application. Masquée sur la fiche produit (barre d'achat) et pendant la commande. */
export function MobileTabBar() {
  const pathname = usePathname();
  const { count } = useCart();
  if (pathname.startsWith("/produit/") || pathname.startsWith("/commande")) return null;

  return (
    <nav
      aria-label="Navigation principale"
      className="border-ink-100 fixed inset-x-0 bottom-0 z-40 border-t bg-white pb-[env(safe-area-inset-bottom)] lg:hidden"
    >
      <ul className="grid grid-cols-5">
        {TABS.map(({ href, label, icon: Icon, match }) => {
          const active = match(pathname);
          return (
            <li key={href}>
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "relative flex h-14 flex-col items-center justify-center gap-0.5 text-[0.68rem] font-semibold",
                  active ? "text-brand-600" : "text-ink-500",
                )}
              >
                <Icon className="size-5" strokeWidth={active ? 2.4 : 1.9} aria-hidden />
                {label}
                {href === "/panier" && count > 0 && (
                  <span className="bg-brand-600 absolute right-[calc(50%-1.2rem)] top-1.5 grid min-w-4 place-items-center rounded-full px-1 text-[0.6rem] font-bold text-white">
                    {count > 99 ? "99+" : count}
                    <span className="sr-only"> article(s)</span>
                  </span>
                )}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
