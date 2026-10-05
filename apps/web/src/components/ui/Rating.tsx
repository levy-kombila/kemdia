import { cn } from "@/lib/cn";

/**
 * Note en étoiles, rendue en texte (★) avec un calque coloré proportionnel.
 * ~150 octets par carte au lieu de 10 SVG (~6 Ko) : page d'accueil allégée de ~300 Ko,
 * important pour les connexions mobiles au Gabon.
 */
export function Rating({
  value,
  count,
  size = "sm",
}: {
  value: number;
  count?: number;
  size?: "sm" | "md";
}) {
  const pct = Math.max(0, Math.min(100, (value / 5) * 100));
  return (
    <div className="flex items-center gap-1.5">
      <span
        role="img"
        aria-label={`Note : ${value.toFixed(1)} sur 5`}
        className={cn(
          "relative inline-block leading-none tracking-[0.1em]",
          size === "sm" ? "text-sm" : "text-lg",
        )}
      >
        <span aria-hidden className="text-ink-200">
          ★★★★★
        </span>
        <span
          aria-hidden
          className="text-accent-500 absolute inset-0 overflow-hidden"
          style={{ width: `${pct}%` }}
        >
          ★★★★★
        </span>
      </span>
      {count !== undefined && <span className="text-ink-500 text-xs">({count})</span>}
    </div>
  );
}
