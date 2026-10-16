"use client";

import { useState, type FormEvent } from "react";
import { Field, FormAlert, SubmitButton } from "@/components/ui/Field";
import { regenerateRecoveryCodesAction, type CodesResult } from "@/lib/staff/actions";
import { RecoveryCodes } from "./RecoveryCodes";

/** Nouveaux codes de secours (S6-T05) : contre un code frais de l'application ; les anciens ne servent plus. */
export function RegenerateCodesForm() {
  const [code, setCode] = useState("");
  const [result, setResult] = useState<CodesResult | null>(null);
  const [pending, setPending] = useState(false);

  if (result?.ok) {
    return (
      <RecoveryCodes
        codes={result.recoveryCodes}
        next={{ href: "/equipe/securite", label: "Terminé" }}
      />
    );
  }

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (pending) return;
    setPending(true);
    const next = await regenerateRecoveryCodesAction(code).catch((): CodesResult => ({
      ok: false,
      message: "Service momentanément indisponible. Réessayez dans quelques instants.",
    }));
    setPending(false);
    setCode("");
    setResult(next);
  };

  return (
    <form onSubmit={submit} noValidate className="space-y-4">
      {result && !result.ok && <FormAlert>{result.message}</FormAlert>}
      <p className="text-ink-700 text-sm">
        Vos anciens codes de secours cesseront aussitôt de fonctionner. Un e-mail vous préviendra.
      </p>
      <Field
        label="Code à 6 chiffres de votre application"
        name="code"
        inputMode="numeric"
        autoComplete="one-time-code"
        pattern="[0-9]{6}"
        maxLength={6}
        value={code}
        onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
        required
      />
      <SubmitButton pending={pending}>Créer de nouveaux codes de secours</SubmitButton>
    </form>
  );
}
