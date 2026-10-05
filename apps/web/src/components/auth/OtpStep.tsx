"use client";

import { MessageSquareText, Mail } from "lucide-react";
import { useEffect, useId, useState, type FormEvent } from "react";
import { authClient, DEMO_OTP, OTP_RESEND_DELAY_S, type OtpPurpose } from "@/lib/auth/client";
import { isValidOtp, maskIdentifier, OTP_LENGTH, type Identifier } from "@/lib/auth/validation";
import { FormAlert, SubmitButton } from "@/components/ui/Field";
import { OtpInput } from "./OtpInput";

const ERRORS = {
  "invalid-code": "Code incorrect. Vérifiez le message reçu et réessayez.",
  "too-many-attempts": "Trop d'essais. Demandez un nouveau code.",
  expired: "Ce code a expiré. Demandez un nouveau code.",
  unavailable: "Service momentanément indisponible. Réessayez dans quelques instants.",
} as const;

type Props = {
  purpose: OtpPurpose;
  identifier: Identifier;
  onVerified: (code: string) => void;
  onBack: () => void;
};

export function OtpStep({ purpose, identifier, onVerified, onBack }: Props) {
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [cooldown, setCooldown] = useState(OTP_RESEND_DELAY_S);
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
    const result = await authClient.verifyOtp(purpose, identifier, code);
    setPending(false);
    if (result.ok) onVerified(code);
    else {
      setError(ERRORS[result.error]);
      setCode("");
    }
  };

  const resend = async () => {
    setCooldown(OTP_RESEND_DELAY_S);
    setError(null);
    setCode("");
    await authClient.resendOtp(purpose, identifier);
    setNotice("Un nouveau code vient d'être envoyé.");
  };

  const Icon = identifier.kind === "phone" ? MessageSquareText : Mail;

  return (
    <form onSubmit={submit} noValidate className="space-y-5">
      <div className="text-center">
        <span className="bg-brand-50 text-brand-600 mx-auto flex size-14 items-center justify-center rounded-full">
          <Icon className="size-7" aria-hidden />
        </span>
        <h2 className="mt-3 text-xl font-extrabold">Saisissez le code reçu</h2>
        <p className="text-ink-500 mt-1 text-sm">
          {identifier.kind === "phone" ? "Envoyé par SMS au " : "Envoyé par e-mail à "}
          <strong className="text-ink-800">{maskIdentifier(identifier)}</strong>
          {" · "}
          <button type="button" onClick={onBack} className="text-brand-700 font-semibold underline">
            Modifier
          </button>
        </p>
      </div>

      <FormAlert tone="info">
        <strong>Mode démonstration</strong> : aucun SMS n&apos;est envoyé. Utilisez le code{" "}
        <strong className="tracking-widest">{DEMO_OTP}</strong>.
      </FormAlert>

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

      <SubmitButton pending={pending}>Vérifier</SubmitButton>

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
