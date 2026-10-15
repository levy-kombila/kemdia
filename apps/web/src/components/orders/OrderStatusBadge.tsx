import type { OrderStatus } from "@kemdia/contracts/constants";
import { cn } from "@/lib/cn";
import { statusLabel } from "@/lib/orders/order-messages";

const TONES: Record<OrderStatus, string> = {
  pending_payment: "bg-accent-400/20 text-ink-900",
  confirmed: "bg-forest-50 text-forest-700",
  preparing: "bg-forest-50 text-forest-700",
  shipped: "bg-brand-50 text-brand-800",
  delivered: "bg-forest-50 text-forest-700",
  cancelled: "bg-ink-100 text-ink-700",
};

/** Statut d'une commande : le texte porte le sens (la couleur n'est qu'un repère). */
export function OrderStatusBadge({ status }: { status: OrderStatus }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold",
        TONES[status],
      )}
    >
      {statusLabel(status)}
    </span>
  );
}
