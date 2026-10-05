import Link from "next/link";
import { cn } from "@/lib/cn";

export function Logo({ className, inverted = false }: { className?: string; inverted?: boolean }) {
  return (
    <Link
      href="/"
      className={cn("group inline-flex items-center gap-2", className)}
      aria-label="Kemdia — accueil"
    >
      <span
        aria-hidden
        className="bg-brand-600 font-display grid size-9 place-items-center rounded-xl text-xl font-black text-white shadow-sm transition-transform group-hover:-rotate-6"
      >
        K
      </span>
      <span className="flex items-baseline">
        <span
          className={cn(
            "font-display text-2xl font-extrabold tracking-tight",
            inverted ? "text-white" : "text-ink-900",
          )}
        >
          Kem<span className="text-brand-600">dia</span>
        </span>
        <span className="bg-accent-400 text-ink-900 ml-1 rounded px-1 text-[0.65rem] font-bold">
          .ga
        </span>
      </span>
    </Link>
  );
}
