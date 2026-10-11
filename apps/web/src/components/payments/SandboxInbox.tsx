"use client";

import { Check, X } from "lucide-react";
import { useActionState } from "react";
import type { SandboxPaymentRequest } from "@kemdia/contracts";
import { FormAlert } from "@/components/ui/Field";
import { formatFCFA } from "@/lib/format";
import { decideSandboxPayment, type SandboxActionState } from "@/lib/payments/sandbox-actions";

const OPERATOR = { airtel: "Airtel Money", moov: "Moov Money" } as const;

/**
 * Boîte de réception du téléphone simulé : une carte par demande (code PIN fictif, Valider ou Refuser). Le message de
 * la dernière réponse est gardé ici, au-dessus des cartes : une demande répondue disparaît de la liste, pas son résultat.
 */
export function SandboxInbox({ requests }: { requests: readonly SandboxPaymentRequest[] }) {
  const [state, action, pending] = useActionState<SandboxActionState, FormData>(
    decideSandboxPayment,
    null,
  );
  return (
    <div className="space-y-3">
      {state && (
        <FormAlert tone={state.tone === "success" ? "info" : "error"}>{state.message}</FormAlert>
      )}
      {requests.length === 0 ? (
        <p className="text-ink-500 text-sm">Aucune demande en attente.</p>
      ) : (
        requests.map((request) => (
          <form
            key={request.paymentId}
            action={action}
            className="space-y-3 rounded-2xl bg-white p-4 text-left shadow-sm"
          >
            <input type="hidden" name="paymentId" value={request.paymentId} />
            <p className="text-ink-500 text-xs font-semibold uppercase tracking-wide">
              {OPERATOR[request.method]}
            </p>
            <p className="text-sm">
              Kemdia demande <strong className="text-base">{formatFCFA(request.amount)}</strong>{" "}
              pour la commande <strong>{request.orderReference}</strong>.
            </p>
            <label className="block text-sm font-medium">
              Code PIN (4 chiffres, fictif)
              <input
                name="pin"
                inputMode="numeric"
                autoComplete="off"
                pattern="[0-9]{4}"
                maxLength={4}
                className="border-ink-200 mt-1 block w-full rounded-xl border px-3 py-2 text-center text-lg tracking-[0.5em]"
              />
            </label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="submit"
                name="decision"
                value="decline"
                formNoValidate
                disabled={pending}
                className="border-ink-200 flex items-center justify-center gap-1 rounded-full border px-4 py-2.5 text-sm font-semibold disabled:opacity-60"
              >
                <X className="size-4" aria-hidden /> Refuser
              </button>
              <button
                type="submit"
                name="decision"
                value="approve"
                disabled={pending}
                aria-busy={pending}
                className="bg-brand-600 hover:bg-brand-700 flex items-center justify-center gap-1 rounded-full px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
              >
                <Check className="size-4" aria-hidden /> Valider
              </button>
            </div>
          </form>
        ))
      )}
    </div>
  );
}
