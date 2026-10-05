"use client";

import { CircleCheck } from "lucide-react";
import Link from "next/link";
import { useState, type FormEvent } from "react";
import { authClient } from "@/lib/auth/client";
import { parseIdentifier, type Identifier } from "@/lib/auth/validation";
import { Field, FormAlert, PasswordField, SubmitButton } from "./Field";
import { OtpStep } from "./OtpStep";
import { PasswordRules, passwordError } from "./PasswordRules";

type Step =
  | { name: "identify" }
  | { name: "otp"; identifier: Identifier }
  | { name: "password"; identifier: Identifier; code: string }
  | { name: "done" };

export function ForgotPasswordForm() {
  const [step, setStep] = useState<Step>({ name: "identify" });
  const [input, setInput] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [failure, setFailure] = useState(false);
  const [pending, setPending] = useState(false);

  const requestCode = async (e: FormEvent) => {
    e.preventDefault();
    if (pending) return;
    const id = parseIdentifier(input);
    if (!id) {
      setError("Saisissez un e-mail valide ou un numéro gabonais (ex. 077 12 34 56).");
      return;
    }
    setError(null);
    setPending(true);
    await authClient.requestPasswordReset(id);
    setPending(false);
    // Même écran que le compte existe ou non : on ne révèle pas qui est client (anti-énumération)
    setStep({ name: "otp", identifier: id });
  };

  const savePassword = async (e: FormEvent) => {
    e.preventDefault();
    if (pending || step.name !== "password") return;
    const pwError = passwordError(password);
    setError(pwError);
    if (pwError) return;
    setPending(true);
    const result = await authClient.resetPassword(step.identifier, step.code, password);
    setPending(false);
    setPassword("");
    if (result.ok) setStep({ name: "done" });
    else setFailure(true);
  };

  if (step.name === "otp") {
    return (
      <OtpStep
        purpose="reset"
        identifier={step.identifier}
        onBack={() => setStep({ name: "identify" })}
        onVerified={(code) => setStep({ name: "password", identifier: step.identifier, code })}
      />
    );
  }

  if (step.name === "password") {
    return (
      <form onSubmit={savePassword} noValidate className="space-y-5">
        {failure && <FormAlert>Le changement a échoué. Recommencez la procédure.</FormAlert>}
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
          Par sécurité, vous serez déconnecté de tous vos appareils. Connectez-vous avec votre
          nouveau mot de passe.
        </p>
        <Link
          href="/connexion"
          className="bg-brand-600 hover:bg-brand-700 mt-6 inline-block rounded-full px-6 py-3 font-semibold text-white"
        >
          Se connecter
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={requestCode} noValidate className="space-y-5">
      <Field
        label="E-mail ou numéro de téléphone"
        name="username"
        autoComplete="username"
        autoCapitalize="none"
        spellCheck={false}
        placeholder="077 12 34 56 ou nom@exemple.ga"
        value={input}
        onChange={(e) => setInput(e.target.value)}
        error={error}
        hint="Si un compte correspond, vous recevrez un code de vérification."
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
