import { ArrowRight } from "lucide-react";
import Link from "next/link";

export function SectionHeader({
  title,
  highlight,
  subtitle,
  href,
  id,
}: {
  title: string;
  highlight: string;
  subtitle?: string;
  href?: string;
  id?: string;
}) {
  return (
    <div className="mb-4 flex items-end justify-between gap-4">
      <div>
        <h2 id={id} className="text-2xl font-extrabold">
          {title} <span className="text-brand-600">{highlight}</span>
        </h2>
        {subtitle && <p className="text-ink-500 mt-0.5 text-sm">{subtitle}</p>}
      </div>
      {href && (
        <Link
          href={href}
          className="border-ink-200 hover:border-brand-600 hover:text-brand-600 flex shrink-0 items-center gap-1 rounded-full border bg-white px-4 py-1.5 text-sm font-semibold"
        >
          Voir tout <ArrowRight className="size-4" aria-hidden />
        </Link>
      )}
    </div>
  );
}
