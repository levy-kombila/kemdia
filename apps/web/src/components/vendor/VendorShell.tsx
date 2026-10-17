import { ClipboardList, LayoutDashboard, Package, PackagePlus, ShieldCheck } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { Breadcrumbs, type Crumb } from "@/components/catalog/Breadcrumbs";
import { FormAlert } from "@/components/ui/Field";
import { cn } from "@/lib/cn";

export type VendorSection = "accueil" | "commandes" | "produits" | "nouveau" | "verification";

const LINKS: { id: VendorSection; label: string; href: string; icon: typeof Package }[] = [
  { id: "accueil", label: "Tableau de bord", href: "/vendeur", icon: LayoutDashboard },
  { id: "commandes", label: "Mes commandes", href: "/vendeur/commandes", icon: ClipboardList },
  { id: "produits", label: "Mes produits", href: "/vendeur/produits", icon: Package },
  {
    id: "nouveau",
    label: "Ajouter un produit",
    href: "/vendeur/produits/nouveau",
    icon: PackagePlus,
  },
  { id: "verification", label: "Vérification", href: "/vendeur/verification", icon: ShieldCheck },
];

/**
 * Cadre des pages de l'espace vendeur (S6-T06) : fil d'Ariane, menu (défilant sur téléphone, en colonne sur
 * ordinateur), avis de la dernière action. Le menu n'apparaît qu'avec une boutique active (`menu`).
 */
export function VendorShell({
  section,
  menu,
  title,
  crumbs = [],
  notice,
  error,
  children,
}: {
  section: VendorSection;
  menu: boolean;
  title: string;
  crumbs?: Crumb[];
  notice?: string | null;
  error?: string | null;
  children: ReactNode;
}) {
  const items: Crumb[] =
    crumbs.length === 0
      ? [{ label: "Espace vendeur" }]
      : [{ label: "Espace vendeur", href: "/vendeur" }, ...crumbs];
  return (
    <div className="container-page py-6">
      <Breadcrumbs items={items} />
      <div className={cn("grid gap-4", menu && "lg:grid-cols-[14rem_1fr] lg:gap-6")}>
        {menu && (
          <nav aria-label="Espace vendeur" className="-mx-4 overflow-x-auto px-4 lg:mx-0 lg:px-0">
            <ul className="flex gap-2 lg:flex-col">
              {LINKS.map(({ id, label, href, icon: Icon }) => (
                <li key={id} className="shrink-0">
                  <Link
                    href={href}
                    aria-current={id === section ? "page" : undefined}
                    className={cn(
                      "flex items-center gap-2 whitespace-nowrap rounded-full px-4 py-2 text-sm font-semibold lg:rounded-xl",
                      id === section
                        ? "bg-brand-600 text-white"
                        : "text-ink-800 hover:bg-brand-50 bg-white",
                    )}
                  >
                    <Icon className="size-4" aria-hidden /> {label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        )}
        <div className={cn("min-w-0 space-y-4", !menu && "mx-auto w-full max-w-2xl")}>
          <h1 className="text-2xl font-extrabold sm:text-3xl">{title}</h1>
          {notice && <FormAlert tone="info">{notice}</FormAlert>}
          {error && <FormAlert>{error}</FormAlert>}
          {children}
        </div>
      </div>
    </div>
  );
}
