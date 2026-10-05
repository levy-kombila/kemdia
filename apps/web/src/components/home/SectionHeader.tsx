import { ChevronRight } from "lucide-react";
import Link from "next/link";

export function SectionHeader({
  title,
  subtitle,
  href,
  id,
}: {
  title: string;
  subtitle?: string;
  href?: string;
  id?: string;
}) {
  return (
    <div className="mb-3 flex items-end justify-between gap-4">
      <div>
        <h2 id={id} className="text-xl font-extrabold sm:text-2xl">
          {title}
        </h2>
        {subtitle && <p className="text-ink-500 text-sm">{subtitle}</p>}
      </div>
      {href && (
        <Link
          href={href}
          className="text-brand-700 hover:text-brand-800 flex shrink-0 items-center text-sm font-semibold hover:underline"
        >
          Voir tout <ChevronRight className="size-4" aria-hidden />
        </Link>
      )}
    </div>
  );
}
