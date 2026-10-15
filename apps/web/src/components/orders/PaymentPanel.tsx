"use client";

import type { Payment } from "@kemdia/contracts";
import { LoaderCircle, RotateCw, Smartphone } from "lucide-react";
import Link from "next/link";
import { useActionState } from "react";
import { FormAlert } from "@/components/ui/Field";
import { formatFCFA, formatTime } from "@/lib/format";
import { retryPayment, type OrderActionState } from "@/lib/orders/order-actions";
import { paymentFailureLabel } from "@/lib/orders/order-messages";
import { formatGabonPhone } from "@/lib/auth/validation";

const OPERATOR = { airtel: "Airtel Money", moov: "Moov Money", cod: "à la livraison" } as const;

type Props = {
  reference: string;
  total: number;
  method: "airtel" | "moov";
  /** Dernier essai (absent : la demande n'a pas pu partir) */
  payment: Payment | null;
  /** Heure limite de paiement (au-delà, la commande est annulée) */
  dueAt: string | null;
  /** Lien vers le téléphone simulé (poste de développement, tests, démo) */
  sandbox: boolean;
  /** Message laissé par le tunnel quand la première demande n'a pas pu partir */
  initialError?: string;
};

/**
 * Attente de la validation Mobile Money (S5-T07, choix du 2026-10-15) : la page de la commande se relit toute seule
 * (AutoRefresh) ; ce panneau dit où en est le dernier essai et propose « Réessayer » (3 essais au plus, côté API).
 */
export function PaymentPanel({
  reference,
  total,
  method,
  payment,
  dueAt,
  sandbox,
  initialError,
}: Props) {
  const [state, action, pending] = useActionState<OrderActionState, FormData>(
    retryPayment,
    initialError ? { tone: "error", message: initialError } : null,
  );
  const waiting = payment?.status === "pending";
  const attemptsLeft = payment ? payment.attemptsLeft : 1;
  const phone = payment?.phone ? formatGabonPhone(payment.phone) : null;

  return (
    <section
      aria-labelledby="paiement-titre"
      className="border-accent-400 space-y-3 rounded-xl border-2 bg-white p-5"
    >
      <div className="flex items-start gap-3">
        <span className="bg-brand-50 grid size-12 shrink-0 place-items-center rounded-full">
          <Smartphone
            className={waiting ? "text-brand-600 size-6 animate-pulse" : "text-brand-600 size-6"}
            aria-hidden
          />
        </span>
        <div className="min-w-0 flex-1">
          <h2 id="paiement-titre" className="text-lg font-extrabold">
            {waiting ? "Validez sur votre téléphone" : "Paiement en attente"}
          </h2>
          <p className="text-ink-700 mt-1 text-sm" role="status">
            {waiting ? (
              <>
                Une demande {OPERATOR[method]} de <strong>{formatFCFA(total)}</strong> a été envoyée
                au <strong>{phone}</strong>. Saisissez votre code secret pour confirmer.
              </>
            ) : payment ? (
              <>
                Le dernier essai n&apos;a pas abouti : {paymentFailureLabel(payment.failureReason)}.
              </>
            ) : (
              <>La demande de paiement n&apos;a pas encore pu être envoyée.</>
            )}
          </p>
          {dueAt && (
            <p className="text-ink-500 mt-1 text-xs">
              À payer avant {formatTime(dueAt)} : ensuite, la commande est annulée et les articles
              remis en vente.
            </p>
          )}
        </div>
      </div>

      {waiting && (
        <p className="text-ink-500 flex items-center gap-2 text-sm">
          <LoaderCircle className="size-4 animate-spin" aria-hidden /> En attente de votre
          validation… Cette page se met à jour toute seule.
        </p>
      )}

      {state && (
        <FormAlert tone={state.tone === "success" ? "info" : "error"}>{state.message}</FormAlert>
      )}

      {!waiting &&
        (attemptsLeft > 0 ? (
          <form action={action} className="space-y-2">
            <input type="hidden" name="reference" value={reference} />
            <button
              type="submit"
              disabled={pending}
              aria-busy={pending}
              className="bg-brand-600 hover:bg-brand-700 flex h-12 w-full items-center justify-center gap-2 rounded-full font-semibold text-white transition disabled:opacity-70 sm:max-w-xs"
            >
              {pending ? (
                <LoaderCircle className="size-5 animate-spin" aria-hidden />
              ) : (
                <RotateCw className="size-4" aria-hidden />
              )}
              {payment ? "Réessayer le paiement" : "Envoyer la demande de paiement"}
            </button>
            {payment && (
              <p className="text-ink-500 text-xs">
                {attemptsLeft === 1
                  ? "Dernier essai possible."
                  : `${attemptsLeft} essais restants.`}
              </p>
            )}
          </form>
        ) : (
          <p className="text-ink-700 text-sm">
            Vous avez utilisé vos 3 essais de paiement. Vous pouvez annuler cette commande et en
            passer une nouvelle (par exemple avec le paiement à la livraison).
          </p>
        ))}

      {sandbox && (
        <p className="bg-ink-50 rounded-lg px-3 py-2 text-xs">
          Démonstration : aucun argent ne circule.{" "}
          <Link
            href="/demo/telephone"
            target="_blank"
            className="text-brand-700 font-semibold underline"
          >
            Ouvrir le téléphone simulé
          </Link>{" "}
          pour valider ou refuser la demande.
        </p>
      )}
    </section>
  );
}
