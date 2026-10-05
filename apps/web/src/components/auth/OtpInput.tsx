"use client";

import { useRef, type ClipboardEvent, type KeyboardEvent } from "react";
import { OTP_LENGTH } from "@/lib/auth/validation";
import { cn } from "@/lib/cn";

type Props = {
  value: string;
  onChange: (value: string) => void;
  invalid?: boolean;
  disabled?: boolean;
  describedBy?: string;
};

/**
 * Saisie du code à 6 chiffres : une case par chiffre, collage du code entier,
 * remplissage automatique depuis le SMS (autocomplete="one-time-code") et clavier numérique sur mobile.
 */
export function OtpInput({ value, onChange, invalid, disabled, describedBy }: Props) {
  const refs = useRef<(HTMLInputElement | null)[]>([]);
  const digits = Array.from({ length: OTP_LENGTH }, (_, i) => value[i] ?? "");

  const focus = (i: number) => refs.current[Math.max(0, Math.min(OTP_LENGTH - 1, i))]?.focus();

  const setFrom = (index: number, input: string) => {
    const clean = input.replace(/\D/g, "");
    if (!clean) return;
    const next = (value.slice(0, index) + clean).slice(0, OTP_LENGTH);
    onChange(next);
    focus(next.length);
  };

  const onInput = (i: number, raw: string) => {
    let clean = raw.replace(/\D/g, "");
    // case déjà remplie : on remplace son chiffre au lieu de décaler les suivants
    if (digits[i] && clean.length === 2 && clean.startsWith(digits[i])) clean = clean.slice(1);
    if (clean.length === 1 && i < value.length) {
      onChange(value.slice(0, i) + clean + value.slice(i + 1));
      focus(i + 1);
    } else setFrom(Math.min(i, value.length), clean);
  };

  const onKeyDown = (i: number, e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Backspace") {
      e.preventDefault();
      const target = digits[i] ? i : i - 1;
      if (target < 0) return;
      onChange(value.slice(0, target));
      focus(target);
    } else if (e.key === "ArrowLeft") focus(i - 1);
    else if (e.key === "ArrowRight") focus(i + 1);
  };

  const onPaste = (i: number, e: ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault();
    setFrom(i, e.clipboardData.getData("text"));
  };

  return (
    <div
      className="flex justify-between gap-2"
      role="group"
      aria-label="Code de vérification à 6 chiffres"
    >
      {digits.map((d, i) => (
        <input
          key={i}
          ref={(el) => {
            refs.current[i] = el;
          }}
          value={d}
          onChange={(e) => onInput(i, e.target.value)}
          onKeyDown={(e) => onKeyDown(i, e)}
          onPaste={(e) => onPaste(i, e)}
          onFocus={(e) => e.target.select()}
          inputMode="numeric"
          autoComplete={i === 0 ? "one-time-code" : "off"}
          maxLength={OTP_LENGTH}
          disabled={disabled}
          aria-label={`Chiffre ${i + 1}`}
          aria-invalid={invalid || undefined}
          aria-describedby={describedBy}
          className={cn(
            "border-ink-200 focus:border-brand-600 focus:ring-brand-100 aspect-square w-full min-w-0 max-w-14 rounded-xl border bg-white text-center text-2xl font-bold outline-none focus:ring-4",
            invalid && "border-brand-600",
          )}
        />
      ))}
    </div>
  );
}
