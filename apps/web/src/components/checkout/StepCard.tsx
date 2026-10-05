import { Check } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

export type StepState = "done" | "current" | "todo";

/** Une étape du tunnel : numéro (coche une fois terminée), résumé, lien « Modifier ». */
export function StepCard({
  n,
  title,
  state,
  summary,
  onEdit,
  children,
}: {
  n: number;
  title: string;
  state: StepState;
  summary?: ReactNode;
  onEdit?: () => void;
  children?: ReactNode;
}) {
  return (
    <li
      aria-current={state === "current" ? "step" : undefined}
      className={cn("rounded-xl bg-white", state === "todo" && "opacity-60")}
    >
      <div className="flex items-start gap-3 px-5 py-4">
        <span
          aria-hidden
          className={cn(
            "font-price grid size-8 shrink-0 place-items-center rounded-full text-base",
            state === "done" && "bg-forest-600 text-white",
            state === "current" && "bg-brand-600 text-white",
            state === "todo" && "bg-ink-100 text-ink-500",
          )}
        >
          {state === "done" ? <Check className="size-4" strokeWidth={3} /> : n}
        </span>
        <div className="min-w-0 flex-1 pt-0.5">
          <h2 tabIndex={-1} className="scroll-mt-40 text-lg font-bold outline-none">
            <span className="sr-only">Étape {n} : </span>
            {title}
            {state === "done" && <span className="sr-only"> (terminée)</span>}
          </h2>
          {state === "done" && summary && (
            <div className="text-ink-700 mt-1 text-sm">{summary}</div>
          )}
        </div>
        {state === "done" && onEdit && (
          <button
            type="button"
            onClick={onEdit}
            className="text-brand-700 shrink-0 pt-1 text-sm font-semibold hover:underline"
          >
            Modifier
          </button>
        )}
      </div>
      {state === "current" && <div className="px-5 pb-5 sm:pl-16">{children}</div>}
    </li>
  );
}
