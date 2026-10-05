"use client";

import { Eye, EyeOff, LoaderCircle } from "lucide-react";
import {
  useId,
  useState,
  type InputHTMLAttributes,
  type ReactNode,
  type Ref,
  type SelectHTMLAttributes,
} from "react";
import { cn } from "@/lib/cn";

const inputClass =
  "border-ink-200 focus:border-brand-600 focus:ring-brand-100 w-full rounded-xl border bg-white px-4 py-3 text-base outline-none transition focus:ring-4 aria-invalid:border-brand-600";

type FieldProps = InputHTMLAttributes<HTMLInputElement> & {
  label: string;
  error?: string | null;
  hint?: ReactNode;
  ref?: Ref<HTMLInputElement>;
  trailing?: ReactNode;
};

/** Champ accessible : libellé relié, message d'erreur annoncé, aide facultative. */
export function Field({ label, error, hint, className, trailing, ref, ...props }: FieldProps) {
  const id = useId();
  const errorId = `${id}-error`;
  const hintId = `${id}-hint`;
  const describedBy = [error ? errorId : null, hint ? hintId : null].filter(Boolean).join(" ");
  return (
    <div className={className}>
      <label htmlFor={id} className="text-ink-800 mb-1.5 block text-sm font-semibold">
        {label}
      </label>
      <div className="relative">
        <input
          ref={ref}
          id={id}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy || undefined}
          className={cn(inputClass, trailing && "pr-12")}
          {...props}
        />
        {trailing}
      </div>
      {hint && (
        <div id={hintId} className="text-ink-500 mt-1.5 text-sm">
          {hint}
        </div>
      )}
      {error && (
        <p id={errorId} className="text-brand-700 mt-1.5 text-sm font-medium">
          {error}
        </p>
      )}
    </div>
  );
}

export function PasswordField(props: Omit<FieldProps, "type" | "trailing">) {
  const [visible, setVisible] = useState(false);
  return (
    <Field
      {...props}
      type={visible ? "text" : "password"}
      autoCapitalize="none"
      autoCorrect="off"
      spellCheck={false}
      trailing={
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          className="text-ink-500 hover:text-ink-800 absolute inset-y-0 right-0 flex w-12 items-center justify-center"
          aria-label={visible ? "Masquer le mot de passe" : "Afficher le mot de passe"}
          aria-pressed={visible}
        >
          {visible ? (
            <EyeOff className="size-5" aria-hidden />
          ) : (
            <Eye className="size-5" aria-hidden />
          )}
        </button>
      }
    />
  );
}

export function SubmitButton({ pending, children }: { pending: boolean; children: ReactNode }) {
  return (
    <button
      type="submit"
      disabled={pending}
      aria-busy={pending}
      className="bg-brand-600 hover:bg-brand-700 flex w-full items-center justify-center gap-2 rounded-full px-6 py-3.5 font-semibold text-white transition disabled:opacity-70"
    >
      {pending && <LoaderCircle className="size-5 animate-spin" aria-hidden />}
      {children}
    </button>
  );
}

export function FormAlert({
  tone = "error",
  children,
}: {
  tone?: "error" | "info";
  children: ReactNode;
}) {
  return (
    <div
      role={tone === "error" ? "alert" : "status"}
      className={cn(
        "rounded-xl px-4 py-3 text-sm",
        tone === "error" ? "bg-brand-50 text-brand-800" : "bg-accent-400/15 text-ink-800",
      )}
    >
      {children}
    </div>
  );
}

type SelectFieldProps = SelectHTMLAttributes<HTMLSelectElement> & {
  label: string;
  error?: string | null;
  hint?: ReactNode;
};

/** Liste déroulante avec le même rendu et la même accessibilité que <Field>. */
export function SelectField({
  label,
  error,
  hint,
  className,
  children,
  ...props
}: SelectFieldProps) {
  const id = useId();
  const describedBy = [error ? `${id}-error` : null, hint ? `${id}-hint` : null]
    .filter(Boolean)
    .join(" ");
  return (
    <div className={className}>
      <label htmlFor={id} className="text-ink-800 mb-1.5 block text-sm font-semibold">
        {label}
      </label>
      <select
        id={id}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy || undefined}
        className={cn(
          inputClass,
          "appearance-none bg-[length:1rem] bg-[right_1rem_center] bg-no-repeat pr-10",
        )}
        style={{
          backgroundImage:
            "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%23636b78' stroke-width='2'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E\")",
        }}
        {...props}
      >
        {children}
      </select>
      {hint && (
        <div id={`${id}-hint`} className="text-ink-500 mt-1.5 text-sm">
          {hint}
        </div>
      )}
      {error && (
        <p id={`${id}-error`} className="text-brand-700 mt-1.5 text-sm font-medium">
          {error}
        </p>
      )}
    </div>
  );
}
