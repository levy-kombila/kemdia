"use client";

import { CheckCircle2, CircleAlert, X } from "lucide-react";
import { createContext, useCallback, useContext, useMemo, useRef, useState } from "react";
import { cn } from "@/lib/cn";

type Toast = { id: number; message: string; tone: "success" | "error" };
type ToastApi = { notify: (message: string, tone?: Toast["tone"]) => void };

const ToastContext = createContext<ToastApi | null>(null);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(1);

  const dismiss = useCallback((id: number) => setToasts((t) => t.filter((x) => x.id !== id)), []);

  const notify = useCallback(
    (message: string, tone: Toast["tone"] = "success") => {
      const id = nextId.current++;
      setToasts((t) => [...t.slice(-2), { id, message, tone }]);
      window.setTimeout(() => dismiss(id), 3500);
    },
    [dismiss],
  );

  const api = useMemo(() => ({ notify }), [notify]);

  return (
    <ToastContext.Provider value={api}>
      {children}
      {/* Le texte est rendu par React (échappé) : pas d'innerHTML, donc pas d'injection possible */}
      <div
        aria-live="polite"
        className="pointer-events-none fixed inset-x-0 bottom-4 z-[100] flex flex-col items-center gap-2 px-4 sm:inset-x-auto sm:right-4 sm:items-end"
      >
        {toasts.map((t) => (
          <div
            key={t.id}
            role="status"
            className={cn(
              "pointer-events-auto flex w-full max-w-sm items-center gap-3 rounded-xl border-l-4 bg-white px-4 py-3 text-sm shadow-[var(--shadow-card-hover)]",
              t.tone === "success" ? "border-success-600" : "border-brand-600",
            )}
          >
            {t.tone === "success" ? (
              <CheckCircle2 className="text-success-600 size-5 shrink-0" aria-hidden />
            ) : (
              <CircleAlert className="text-brand-600 size-5 shrink-0" aria-hidden />
            )}
            <p className="flex-1">{t.message}</p>
            <button
              type="button"
              onClick={() => dismiss(t.id)}
              className="text-ink-400 hover:text-ink-900 rounded p-1"
              aria-label="Fermer la notification"
            >
              <X className="size-4" />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastApi {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast doit être utilisé dans <ToastProvider>");
  return ctx;
}

const NO_TOAST: ToastApi = { notify: () => {} };

/** Comme `useToast`, sans exiger le fournisseur (composants testés seuls). */
export function useOptionalToast(): ToastApi {
  return useContext(ToastContext) ?? NO_TOAST;
}
