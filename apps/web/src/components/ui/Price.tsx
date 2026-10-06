import { cn } from "@/lib/cn";
import { formatFCFA } from "@/lib/format";

const nf = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 });
const digits = (n: number) => nf.format(Math.round(n)).replace(/\s/g, " ");

const SIZES = {
  sm: { amount: "text-[1.35rem] leading-none", unit: "text-[0.65rem]", old: "text-xs" },
  md: { amount: "text-2xl leading-none", unit: "text-xs", old: "text-sm" },
  lg: { amount: "text-[2.75rem] leading-none", unit: "text-base", old: "text-base" },
} as const;

/**
 * Prix en « étiquette de marché » : chiffres condensés très gras, « FCFA » en petit.
 * Le texte complet (« 148 000 FCFA ») reste lu d'un bloc par les lecteurs d'écran.
 */
export function Price({
  price,
  oldPrice,
  size = "md",
  showSavings = false,
  prefix,
  className,
}: {
  price: number;
  /** Petit mot avant le prix (« dès » quand le prix dépend de la variante choisie) */
  prefix?: string;
  oldPrice?: number | null;
  size?: keyof typeof SIZES;
  showSavings?: boolean;
  className?: string;
}) {
  const s = SIZES[size];
  const showOld = oldPrice != null && oldPrice > price;
  return (
    <div className={cn("flex flex-col", className)}>
      <p className="text-ink-900 flex items-baseline gap-1 whitespace-nowrap">
        <span className="sr-only">
          {prefix ? `${prefix} ` : ""}
          {formatFCFA(price)}
        </span>
        {prefix && (
          <span aria-hidden className={cn("text-ink-500 font-semibold", s.unit)}>
            {prefix}
          </span>
        )}
        <span aria-hidden className={cn("font-price", s.amount)}>
          {digits(price)}
        </span>
        <span aria-hidden className={cn("font-semibold", s.unit)}>
          FCFA
        </span>
      </p>
      {showOld && (
        <p className={cn("mt-1 flex flex-wrap items-baseline gap-x-2 whitespace-nowrap", s.old)}>
          <span className="text-ink-500 line-through">
            <span className="sr-only">Prix d&apos;origine : </span>
            {formatFCFA(oldPrice)}
          </span>
          {showSavings && (
            <span className="text-forest-700 font-semibold">
              Vous économisez {formatFCFA(oldPrice - price)}
            </span>
          )}
        </p>
      )}
    </div>
  );
}

/** Pastille de remise jaune, légèrement inclinée comme un autocollant posé à la main. */
export function DiscountSticker({ percent, className }: { percent: number; className?: string }) {
  return (
    <span
      className={cn(
        "bg-accent-400 text-ink-900 font-price inline-block -rotate-3 rounded-md px-1.5 py-0.5 text-sm shadow-[0_1px_0_rgb(0_0_0/0.15)]",
        className,
      )}
    >
      -{percent} %
    </span>
  );
}
