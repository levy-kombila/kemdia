import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

/** Pastille de statut lisible (couleur + texte : jamais la couleur seule). */
export function StatusBadge({
  tone,
  children,
}: {
  tone: "wait" | "ok" | "bad" | "off";
  children: ReactNode;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-bold",
        tone === "wait" && "bg-accent-400/20 text-ink-900",
        tone === "ok" && "bg-forest-50 text-forest-700",
        tone === "bad" && "bg-brand-50 text-brand-800",
        tone === "off" && "bg-ink-100 text-ink-700",
      )}
    >
      {children}
    </span>
  );
}
