import { hasRole, type Role, type StaffRole } from "@kemdia/contracts/constants";
import {
  BadgePercent,
  Banknote,
  FileText,
  IdCard,
  ScrollText,
  Settings,
  Undo2,
  LayoutDashboard,
  Layers,
  LifeBuoy,
  ShieldCheck,
  Store,
  Tags,
  Truck,
  Users,
  MessageSquare,
  Bug,
  Ticket,
} from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { Breadcrumbs, type Crumb } from "@/components/catalog/Breadcrumbs";
import { FormAlert } from "@/components/ui/Field";
import { cn } from "@/lib/cn";

export type StaffSection =
  | "accueil"
  | "boutiques"
  | "verifications"
  | "livraisons"
  | "moderation"
  | "fiches"
  | "avis"
  | "clients"
  | "signalements"
  | "beta"
  | "utilisateurs"
  | "factures"
  | "encaissements"
  | "remboursements"
  | "codes-promo"
  | "reglages"
  | "journal"
  | "securite";

/** Menu de l'équipe : chaque lien n'est montré qu'au rôle qui l'ouvre (S7.5-T04, ADR-0051 ; l'API reste juge). */
const LINKS: {
  id: StaffSection;
  label: string;
  href: string;
  icon: typeof Store;
  role?: StaffRole;
}[] = [
  { id: "accueil", label: "Tableau de bord", href: "/equipe", icon: LayoutDashboard },
  {
    id: "moderation",
    label: "Modération",
    href: "/equipe/moderation",
    icon: Tags,
    role: "catalog",
  },
  { id: "fiches", label: "Fiches produits", href: "/equipe/fiches", icon: Layers, role: "catalog" },
  { id: "avis", label: "Avis clients", href: "/equipe/avis", icon: MessageSquare, role: "catalog" },
  { id: "boutiques", label: "Boutiques", href: "/equipe/boutiques", icon: Store, role: "catalog" },
  {
    id: "verifications",
    label: "Vérifications",
    href: "/equipe/verifications",
    icon: IdCard,
    role: "catalog",
  },
  {
    id: "livraisons",
    label: "Livraisons",
    href: "/equipe/livraisons",
    icon: Truck,
    role: "logistics",
  },
  { id: "clients", label: "Clients", href: "/equipe/clients", icon: LifeBuoy, role: "support" },
  // Bêta fermée (S8-T02, ADR-0057)
  {
    id: "signalements",
    label: "Signalements",
    href: "/equipe/signalements",
    icon: Bug,
    role: "support",
  },
  { id: "beta", label: "Bêta fermée", href: "/equipe/beta", icon: Ticket, role: "admin" },
  // Finance (S7.5-T05, ADR-0052)
  { id: "factures", label: "Factures", href: "/equipe/factures", icon: FileText, role: "finance" },
  {
    id: "encaissements",
    label: "Encaissements",
    href: "/equipe/encaissements",
    icon: Banknote,
    role: "finance",
  },
  {
    id: "remboursements",
    label: "Remboursements",
    href: "/equipe/remboursements",
    icon: Undo2,
    role: "finance",
  },
  {
    id: "codes-promo",
    label: "Codes promo",
    href: "/equipe/codes-promo",
    icon: BadgePercent,
    role: "finance",
  },
  { id: "reglages", label: "Réglages", href: "/equipe/reglages", icon: Settings, role: "finance" },
  {
    id: "utilisateurs",
    label: "Utilisateurs",
    href: "/equipe/utilisateurs",
    icon: Users,
    role: "admin",
  },
  { id: "journal", label: "Journal", href: "/equipe/journal", icon: ScrollText, role: "admin" },
  { id: "securite", label: "Sécurité", href: "/equipe/securite", icon: ShieldCheck },
];

/**
 * Cadre des pages de l'équipe (S6-T05) : fil d'Ariane, menu (défilant sur téléphone, en colonne sur ordinateur),
 * avis de la dernière action et contenu. Seuls les liens des rôles du membre sont montrés (l'API refuse de toute façon
 * les autres).
 */
export function StaffShell({
  section,
  roles,
  title,
  crumbs = [],
  notice,
  error,
  children,
}: {
  section: StaffSection;
  roles: readonly Role[];
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
            {LINKS.filter((link) => !link.role || hasRole(roles, link.role)).map(
              ({ id, label, href, icon: Icon }) => (
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
              ),
            )}
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
