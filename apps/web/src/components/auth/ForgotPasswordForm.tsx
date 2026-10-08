"use client";

import { CircleCheck } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { authClient, type AuthResult, type CodeSent, type SignedIn } from "@/lib/auth/client";
import { authErrorMessage } from "@/lib/auth/messages";
import { parseIdentifier } from "@/lib/auth/validation";
import { Field, FormAlert, PasswordField, SubmitButton } from "@/components/ui/Field";
import { OtpStep } from "./OtpStep";
import { PasswordRules, passwordError } from "./PasswordRules";

type Step =
  | { name: "identify"; error?: string | null }
  | { name: "otp"; sent: CodeSent; error?: string | null }
  | { name: "password"; sent: CodeSent; code: string }
  | { name: "done"; firstName: string };

/** L'API ne vérifie le code qu'avec le nouveau mot de passe : ces erreurs renvoient à l'étape du code. */
const CODE_ERRORS = new Set(["CODE_INVALIDE", "TROP_D_ESSAIS"]);

export function ForgotPasswordForm() {
  const router = useRouter();
  const [step, setStep] = useState<Step>({ name: "identify" });
  const [input, setInput] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const requestCode = async (e: FormEvent) => {
    e.preventDefault();
    if (pending) return;
    const id = parseIdentifier(input);
    if (!id) return setError("Saisissez une adresse e-mail valide.");
    setError(null);
    setPending(true);
    const result = await authClient
      .requestPasswordReset(id.value)
      .catch((): AuthResult<CodeSent> => ({ ok: false, code: "INDISPONIBLE" }));
    setPending(false);
    // Même écran que le compte existe ou non : on ne révèle pas qui est client (anti-énumération)
    if (result.ok) setStep({ name: "otp", sent: result });
    else setError(authErrorMessage(result));
  };

  const savePassword = async (e: FormEvent) => {
    e.preventDefault();
    if (pending || step.name !== "password") return;
    const pwError = passwordError(password);
    setError(pwError);
    if (pwError) return;
    setPending(true);
    const result = await authClient
      .resetPassword(step.code, password)
      .catch((): SignedIn => ({ ok: false, code: "INDISPONIBLE" }));
    setPending(false);
    if (result.ok) {
      setPassword("");
      setStep({ name: "done", firstName: result.account.firstName });
      router.refresh();
    } else if (CODE_ERRORS.has(result.code)) {
      setStep({ name: "otp", sent: step.sent, error: authErrorMessage(result) });
    } else if (result.code === "CODE_EXPIRE") {
      setPassword("");
      setStep({
        name: "identify",
        error: "Demande expirée ou remplacée : recommencez pour recevoir un nouveau code.",
      });
    } else {
      setError(authErrorMessage(result));
    }
  };

  if (step.name === "otp") {
    return (
      <OtpStep
        sent={step.sent}
        initialError={step.error}
        submitLabel="Continuer"
        onBack={() => setStep({ name: "identify" })}
        onResend={() => authClient.resendReset()}
        // Le code est vérifié avec le nouveau mot de passe (étape suivante)
        onSubmit={(code) => {
          setError(null);
          setStep({ name: "password", sent: step.sent, code });
          return Promise.resolve({ ok: true });
        }}
      />
    );
  }

  if (step.name === "password") {
    return (
      <form onSubmit={savePassword} noValidate className="space-y-5">
        <PasswordField
          label="Nouveau mot de passe"
          name="new-password"
          autoComplete="new-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          error={error}
          hint={<PasswordRules password={password} />}
          maxLength={128}
          autoFocus
        />
        <SubmitButton pending={pending}>Enregistrer le mot de passe</SubmitButton>
      </form>
    );
  }

  if (step.name === "done") {
    return (
      <div className="text-center" role="status">
        <CircleCheck className="text-success-600 mx-auto size-16" aria-hidden />
        <h2 className="mt-3 text-xl font-extrabold">Mot de passe modifié</h2>
        <p className="text-ink-500 mt-2">
          Vous êtes connecté, {step.firstName}. Par sécurité, vos autres appareils ont été
          déconnectés, et un e-mail de confirmation vous a été envoyé.
        </p>
        <Link
          href="/"
          className="bg-brand-600 hover:bg-brand-700 mt-6 inline-block rounded-full px-6 py-3 font-semibold text-white"
        >
          Continuer mes achats
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={requestCode} noValidate className="space-y-5">
      {step.error && <FormAlert>{step.error}</FormAlert>}
      <Field
        label="Adresse e-mail"
        name="username"
        type="email"
        inputMode="email"
        autoComplete="username"
        autoCapitalize="none"
        spellCheck={false}
        placeholder="nom@exemple.ga"
        value={input}
        onChange={(e) => setInput(e.target.value)}
        error={error}
        hint="Si un compte correspond, vous recevrez un code par e-mail. Par téléphone : bientôt disponible."
        maxLength={254}
      />
      <SubmitButton pending={pending}>Recevoir un code</SubmitButton>
      <p className="text-center text-sm">
        <Link href="/connexion" className="text-brand-700 font-semibold">
          Retour à la connexion
        </Link>
      </p>
    </form>
  );
}
