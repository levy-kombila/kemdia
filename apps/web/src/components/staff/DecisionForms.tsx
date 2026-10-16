import { Check, X } from "lucide-react";
import type { ReactNode } from "react";

/**
 * Formulaires de décision de l'équipe (S6-T05) : de simples formulaires HTML envoyés à une action serveur. Ils
 * fonctionnent sans JavaScript et n'ajoutent aucun code au navigateur. Les champs cachés (identifiant, version lue)
 * sont revérifiés par l'action ET par l'API.
 */

type Hidden = Record<string, string>;
type Action = (form: FormData) => Promise<never>;

function HiddenFields({ values }: { values: Hidden }) {
  return Object.entries(values).map(([name, value]) => (
    <input key={name} type="hidden" name={name} value={value} />
  ));
}

export function ApproveForm({
  action,
  hidden,
  children,
}: {
  action: Action;
  hidden: Hidden;
  children: ReactNode;
}) {
  return (
    <form action={action}>
      <HiddenFields values={{ ...hidden, decision: "approve" }} />
      <button
        type="submit"
        className="bg-forest-700 flex w-full items-center justify-center gap-2 rounded-full px-6 py-3 font-semibold text-white hover:opacity-90 sm:w-auto"
      >
        <Check className="size-5" aria-hidden /> {children}
      </button>
    </form>
  );
}

/**
 * Refus ou suspension : un motif est obligatoire (montré au vendeur). Replié par défaut, pour qu'un clic distrait ne
 * suffise pas.
 */
export function ReasonForm({
  action,
  hidden,
  decision,
  label,
  button,
  min,
  max,
}: {
  action: Action;
  hidden: Hidden;
  decision: "reject" | "suspend";
  label: string;
  button: string;
  min: number;
  max: number;
}) {
  return (
    <details className="border-ink-200 group rounded-xl border-2 bg-white">
      <summary className="text-brand-700 flex cursor-pointer items-center gap-2 px-5 py-3 font-semibold">
        <X className="size-5" aria-hidden /> {button}…
      </summary>
      <form action={action} className="space-y-3 px-5 pb-5">
        <HiddenFields values={{ ...hidden, decision }} />
        <label className="block">
          <span className="text-ink-800 mb-1.5 block text-sm font-semibold">{label}</span>
          <textarea
            name="reason"
            required
            minLength={min}
            maxLength={max}
            rows={3}
            className="border-ink-200 focus:border-brand-600 focus:ring-brand-100 w-full rounded-xl border bg-white px-4 py-3 text-base outline-none focus:ring-4"
          />
          <span className="text-ink-500 mt-1 block text-sm">
            {min} à {max} caractères. Le vendeur verra ce motif.
          </span>
        </label>
        <button
          type="submit"
          className="bg-brand-600 hover:bg-brand-700 rounded-full px-6 py-2.5 font-semibold text-white"
        >
          {button}
        </button>
      </form>
    </details>
  );
}
