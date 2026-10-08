"use client";

import { MessageSquareText, Mail } from "lucide-react";
import { useEffect, useId, useState, type FormEvent } from "react";
import type { AuthResult, CodeSent } from "@/lib/auth/client";
import { authErrorMessage } from "@/lib/auth/messages";
import { isValidOtp, OTP_LENGTH } from "@/lib/auth/validation";
import { SubmitButton } from "@/components/ui/Field";
import { OtpInput } from "./OtpInput";

type Props = {
  /** Envoi en cours : canal, destination masquée par l'API, délai avant un nouveau code. */
  sent: CodeSent;
  /** Vérifie le code ; une erreur reste affichée et le champ est vidé. */
  onSubmit: (code: string) => Promise<AuthResult>;
  onResend: () => Promise<AuthResult<CodeSent>>;
  onBack: () => void;
  /** Erreur à afficher en arrivant (ex. code refusé à l'étape suivante). */
  initialError?: string | null;
  submitLabel?: string;
};

export function OtpStep({
  sent,
  onSubmit,
  onResend,
  onBack,
  initialError = null,
  submitLabel = "Vérifier",
}: Props) {
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(initialError);
  const [notice, setNotice] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [cooldown, setCooldown] = useState(sent.resendInSeconds);
  const errorId = useId();

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (pending) return;
    if (!isValidOtp(code)) {
      setError(`Saisissez les ${OTP_LENGTH} chiffres du code.`);
      return;
    }
    setPending(true);
    setError(null);
    setNotice(null);
    const result = await onSubmit(code).catch((): AuthResult => ({
      ok: false,
      code: "INDISPONIBLE",
    }));
    setPending(false);
    if (!result.ok) {
      setError(authErrorMessage(result));
      setCode("");
    }
  };

  const resend = async () => {
    if (pending) return;
    setPending(true);
    setError(null);
    setNotice(null);
    setCode("");
    const result = await onResend().catch((): AuthResult<CodeSent> => ({
      ok: false,
      code: "INDISPONIBLE",
    }));
    setPending(false);
    if (result.ok) {
      setCooldown(result.resendInSeconds);
      setNotice("Un nouveau code vient d'être envoyé.");
    } else {
      setError(authErrorMessage(result));
      if (result.retryAfterSeconds) setCooldown(result.retryAfterSeconds);
    }
  };

  const Icon = sent.channel === "sms" ? MessageSquareText : Mail;

  return (
    <form onSubmit={submit} noValidate className="space-y-5">
      <div className="text-center">
        <span className="bg-brand-50 text-brand-600 mx-auto flex size-14 items-center justify-center rounded-full">
          <Icon className="size-7" aria-hidden />
        </span>
        <h2 className="mt-3 text-xl font-extrabold">Saisissez le code reçu</h2>
        <p className="text-ink-500 mt-1 text-sm">
          {sent.channel === "sms" ? "Envoyé par SMS au " : "Envoyé par e-mail à "}
          <strong className="text-ink-800">{sent.sentTo}</strong>
          {" · "}
          <button type="button" onClick={onBack} className="text-brand-700 font-semibold underline">
            Modifier
          </button>
        </p>
        <p className="text-ink-500 mt-1 text-xs">
          Le code est valable 10 minutes. Pensez à regarder dans vos courriers indésirables.
        </p>
      </div>

      <OtpInput
        value={code}
        onChange={setCode}
        invalid={!!error}
        disabled={pending}
        describedBy={error ? errorId : undefined}
      />
      {error && (
        <p id={errorId} role="alert" className="text-brand-700 text-center text-sm font-medium">
          {error}
        </p>
      )}
      {notice && !error && (
        <p role="status" className="text-success-600 text-center text-sm font-medium">
          {notice}
        </p>
      )}

      <SubmitButton pending={pending}>{submitLabel}</SubmitButton>

      <p className="text-ink-500 text-center text-sm">
        Pas reçu ?{" "}
        {cooldown > 0 ? (
          <span>Nouveau code possible dans {cooldown} s</span>
        ) : (
          <button type="button" onClick={resend} className="text-brand-700 font-semibold underline">
            Renvoyer le code
          </button>
        )}
      </p>
    </form>
  );
}
