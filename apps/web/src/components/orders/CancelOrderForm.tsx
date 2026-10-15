"use client";

import { LoaderCircle } from "lucide-react";
import { useActionState, useState } from "react";
import { FormAlert } from "@/components/ui/Field";
import { cancelOrder, type OrderActionState } from "@/lib/orders/order-actions";

/**
 * Annulation par le client (avant l'expédition) : deux temps, pour ne pas annuler par un clic de trop. L'API revérifie
 * le compte et le statut ; une commande payée ne s'annule pas ici (service client, remboursement).
 */
export function CancelOrderForm({ reference }: { reference: string }) {
  const [state, action, pending] = useActionState<OrderActionState, FormData>(cancelOrder, null);
  const [confirming, setConfirming] = useState(false);

  if (state?.tone === "success") return <FormAlert tone="info">{state.message}</FormAlert>;

  return (
    <div className="space-y-2">
      {state && <FormAlert>{state.message}</FormAlert>}
      {confirming ? (
        <form action={action} className="space-y-2">
          <input type="hidden" name="reference" value={reference} />
          <p className="text-sm font-semibold">
            Annuler la commande {reference} ? Les articles seront remis en vente.
          </p>
          <div className="flex flex-col gap-2 sm:flex-row">
            <button
              type="submit"
              disabled={pending}
              aria-busy={pending}
              className="bg-brand-600 hover:bg-brand-700 flex h-11 items-center justify-center gap-2 rounded-full px-5 font-semibold text-white disabled:opacity-70"
            >
              {pending && <LoaderCircle className="size-4 animate-spin" aria-hidden />}
              Oui, annuler la commande
            </button>
            <button
              type="button"
              onClick={() => setConfirming(false)}
              disabled={pending}
              className="border-ink-200 hover:bg-ink-50 h-11 rounded-full border-2 px-5 font-semibold"
            >
              Non, la garder
            </button>
          </div>
        </form>
      ) : (
        <button
          type="button"
          onClick={() => setConfirming(true)}
          className="border-ink-200 hover:bg-ink-50 h-11 rounded-full border-2 px-5 text-sm font-semibold"
        >
          Annuler la commande
        </button>
      )}
    </div>
  );
}
