"use client";

import Link from "next/link";
import { useRef, useState, type FormEvent } from "react";
import { Field, FormAlert, SubmitButton } from "@/components/ui/Field";
import { verifySecondFactorAction, type StaffActionFailure } from "@/lib/staff/actions";

const UNAVAILABLE = "Service momentanément indisponible. Réessayez dans quelques instants.";

/**
 * Saisie du code (S6-T05) : code de l'application, ou code de secours. Réussite → l'action serveur renvoie à la page
 * demandée ; échec → message, champ vidé. Au 3ᵉ code faux, l'API ferme la session (ADR-0034).
 */
export function VerifyCodeForm({ returnTo }: { returnTo: string }) {
  const [code, setCode] = useState("");
  const [recovery, setRecovery] = useState(false);
  const [alert, setAlert] = useState<StaffActionFailure | null>(null);
  const [pending, setPending] = useState(false);
  const ref = useRef<HTMLInputElement>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (pending || !code) return;
    setPending(true);
    setAlert(null);
    // Réussite : `redirect` côté serveur, cette promesse ne revient pas avec un résultat
    const result = await verifySecondFactorAction(code, returnTo).catch(
      (error: unknown): StaffActionFailure | undefined => {
        // Une redirection de Next.js passe par une exception : on la laisse faire
        const digest = (error as { digest?: unknown } | null)?.digest;
        if (typeof digest === "string" && digest.startsWith("NEXT_REDIRECT")) throw error;
        return { ok: false, message: UNAVAILABLE };
      },
    );
    setPending(false);
    setCode("");
    if (result && !result.ok) {
      setAlert(result);
      ref.current?.focus();
    }
  };

  return (
    <form onSubmit={submit} noValidate className="space-y-4 rounded-xl bg-white p-6">
      {alert && (
        <FormAlert>
          {alert.message}{" "}
          {alert.signedOut && (
            <Link
              href={`/connexion?retour=${encodeURIComponent(returnTo)}`}
              className="font-semibold underline"
            >
              Se reconnecter
            </Link>
          )}
        </FormAlert>
      )}
      {recovery ? (
        <Field
          ref={ref}
          key="recovery"
          label="Code de secours"
          name="code"
          autoComplete="off"
          autoCapitalize="none"
          spellCheck={false}
          placeholder="abcd-efgh-jkmn"
          maxLength={20}
          value={code}
          onChange={(e) => setCode(e.target.value)}
          hint="Chaque code de secours ne sert qu'une fois."
          required
        />
      ) : (
        <Field
          ref={ref}
          key="totp"
          label="Code à 6 chiffres de votre application"
          name="code"
          inputMode="numeric"
          autoComplete="one-time-code"
          pattern="[0-9]{6}"
          maxLength={6}
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
          required
          autoFocus
        />
      )}
      <SubmitButton pending={pending}>Confirmer</SubmitButton>
      <button
        type="button"
        onClick={() => {
          setRecovery((r) => !r);
          setCode("");
          setAlert(null);
        }}
        className="text-brand-700 text-sm font-semibold underline"
      >
        {recovery
          ? "Utiliser le code de l'application"
          : "Téléphone perdu ? Utiliser un code de secours"}
      </button>
    </form>
  );
}
