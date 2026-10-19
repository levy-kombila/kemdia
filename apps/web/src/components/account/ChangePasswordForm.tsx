"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { PasswordRules, passwordError } from "@/components/auth/PasswordRules";
import { FormAlert, PasswordField, SubmitButton } from "@/components/ui/Field";
import { changePasswordAction } from "@/lib/auth/actions";
import type { AuthResult } from "@/lib/auth/client";
import { authErrorMessage } from "@/lib/auth/messages";

type Outcome = { kind: "done" } | { kind: "error"; message: string } | null;

/**
 * « Changer mon mot de passe » (S7-T07, OWASP ASVS 5.0 V6.2.2 et V6.2.3) : mot de passe actuel + nouveau. Les autres
 * appareils sont déconnectés ; cet appareil reste connecté (nouvelle session). Collage et gestionnaires de mots de
 * passe permis (V6.2.7) ; champs masqués avec bouton « afficher » (V6.2.6).
 */
export function ChangePasswordForm() {
  const router = useRouter();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [nextError, setNextError] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<Outcome>(null);
  const [pending, setPending] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (pending) return;
    const problem = passwordError(next);
    setNextError(problem);
    if (problem || current.length === 0) {
      if (current.length === 0)
        setOutcome({ kind: "error", message: "Saisissez votre mot de passe actuel." });
      return;
    }
    setPending(true);
    setOutcome(null);
    const result = await changePasswordAction(current, next).catch((): AuthResult<never> => ({
      ok: false,
      code: "INDISPONIBLE",
    }));
    setPending(false);
    setCurrent("");
    if (result.ok) {
      setNext("");
      setOutcome({ kind: "done" });
      router.refresh();
      return;
    }
    if (result.code === "MOT_DE_PASSE_FAIBLE") return setNextError(authErrorMessage(result));
    if (result.code === "SESSION_INVALIDE") {
      // Session fermée par l'API (3e erreur) ou expirée : retour à la connexion
      router.push("/connexion?retour=/compte");
      return;
    }
    setOutcome({ kind: "error", message: authErrorMessage(result) });
  };

  return (
    <form
      onSubmit={submit}
      noValidate
      className="mt-6 max-w-md space-y-4"
      aria-labelledby="changer-mdp"
    >
      <h3 id="changer-mdp" className="font-bold">
        Changer mon mot de passe
      </h3>
      {outcome?.kind === "done" && (
        <FormAlert tone="info">
          Mot de passe modifié. Vos autres appareils ont été déconnectés et un e-mail de
          confirmation vous a été envoyé.
        </FormAlert>
      )}
      {outcome?.kind === "error" && <FormAlert>{outcome.message}</FormAlert>}
      <PasswordField
        label="Mot de passe actuel"
        name="current-password"
        autoComplete="current-password"
        value={current}
        onChange={(e) => setCurrent(e.target.value)}
        maxLength={128}
      />
      <PasswordField
        label="Nouveau mot de passe"
        name="new-password"
        autoComplete="new-password"
        value={next}
        onChange={(e) => setNext(e.target.value)}
        error={nextError}
        hint={<PasswordRules password={next} />}
        maxLength={128}
      />
      <SubmitButton pending={pending}>Enregistrer le nouveau mot de passe</SubmitButton>
    </form>
  );
}
