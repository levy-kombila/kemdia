import { cn } from "@/lib/cn";
import { formatFCFA } from "@/lib/format";

export function Price({
  price,
  oldPrice,
  size = "md",
  className,
}: {
  price: number;
  oldPrice?: number | null;
  size?: "sm" | "md" | "lg";
  className?: string;
}) {
  const showOld = oldPrice != null && oldPrice > price;
  return (
    <div className={cn("flex flex-wrap items-baseline gap-x-2", className)}>
      <span
        className={cn(
          "font-display text-brand-600 font-bold",
          size === "sm" && "text-sm",
          size === "md" && "text-base",
          size === "lg" && "text-3xl",
        )}
      >
        {formatFCFA(price)}
      </span>
      {showOld && (
        <span className={cn("text-ink-400 line-through", size === "lg" ? "text-base" : "text-xs")}>
          <span className="sr-only">Prix d&apos;origine : </span>
          {formatFCFA(oldPrice)}
        </span>
      )}
    </div>
  );
}
