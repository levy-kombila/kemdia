import { IdCard, LayoutDashboard, ShieldCheck, Store, Tags } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { Breadcrumbs, type Crumb } from "@/components/catalog/Breadcrumbs";
import { FormAlert } from "@/components/ui/Field";
import { cn } from "@/lib/cn";

export type StaffSection = "accueil" | "boutiques" | "verifications" | "moderation" | "securite";

const LINKS: { id: StaffSection; label: string; href: string; icon: typeof Store; admin?: true }[] =
  [
    { id: "accueil", label: "Tableau de bord", href: "/equipe", icon: LayoutDashboard },
    { id: "boutiques", label: "Boutiques", href: "/equipe/boutiques", icon: Store, admin: true },
    {
      id: "verifications",
      label: "Vérifications",
      href: "/equipe/verifications",
      icon: IdCard,
      admin: true,
    },
    { id: "moderation", label: "Modération", href: "/equipe/moderation", icon: Tags },
    { id: "securite", label: "Sécurité", href: "/equipe/securite", icon: ShieldCheck },
  ];

/**
 * Cadre des pages de l'équipe (S6-T05) : fil d'Ariane, menu (défilant sur téléphone, en colonne sur ordinateur),
 * avis de la dernière action et contenu. Les liens « Boutiques » ne sont montrés qu'aux administrateurs (l'API refuse
 * de toute façon les autres).
 */
export function StaffShell({
  section,
  admin,
  title,
  crumbs = [],
  notice,
  error,
  children,
}: {
  section: StaffSection;
  admin: boolean;
  title: string;
  crumbs?: Crumb[];
  notice?: string | null;
  error?: string | null;
  children: ReactNode;
}) {
  const items: Crumb[] = [{ label: "Équipe", href: "/equipe" }, ...crumbs];
  return (
    <div className="container-page py-6">
      <Breadcrumbs
        items={section === "accueil" && crumbs.length === 0 ? [{ label: "Équipe" }] : items}
      />
      <div className="grid gap-4 lg:grid-cols-[14rem_1fr] lg:gap-6">
        <nav aria-label="Espace de l'équipe" className="-mx-4 overflow-x-auto px-4 lg:mx-0 lg:px-0">
          <ul className="flex gap-2 lg:flex-col">
            {LINKS.filter((link) => admin || !link.admin).map(({ id, label, href, icon: Icon }) => (
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
        <div className="min-w-0 space-y-4">
          <h1 className="text-2xl font-extrabold sm:text-3xl">{title}</h1>
          {notice && <FormAlert tone="info">{notice}</FormAlert>}
          {error && <FormAlert>{error}</FormAlert>}
          {children}
        </div>
      </div>
    </div>
  );
}

// Pastille partagée avec l'espace vendeur (S6-T06)
export { StatusBadge } from "@/components/ui/StatusBadge";
