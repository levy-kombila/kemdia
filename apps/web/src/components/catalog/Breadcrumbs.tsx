import { ChevronRight, House } from "lucide-react";
import Link from "next/link";

export type Crumb = { label: string; href?: string };

export function Breadcrumbs({ items }: { items: Crumb[] }) {
  return (
    <nav aria-label="Fil d'Ariane" className="mb-4 text-sm">
      <ol className="text-ink-500 flex flex-wrap items-center gap-1">
        <li>
          <Link href="/" className="hover:text-brand-600 flex items-center" aria-label="Accueil">
            <House className="size-4" />
          </Link>
        </li>
        {items.map((c, i) => (
          <li key={`${c.label}-${i}`} className="flex items-center gap-1">
            <ChevronRight className="text-ink-200 size-3.5" aria-hidden />
            {c.href && i < items.length - 1 ? (
              <Link href={c.href} className="hover:text-brand-600">
                {c.label}
              </Link>
            ) : (
              <span aria-current="page" className="text-ink-900 font-medium">
                {c.label}
              </span>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}
