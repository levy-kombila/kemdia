"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { FormAlert, PasswordField, SubmitButton } from "@/components/ui/Field";
import { deleteAccountAction, type DeleteAccountResult } from "@/lib/privacy/actions";
import { deletionErrorMessage } from "@/lib/privacy/messages";

/**
 * « Supprimer mon compte » (S7-T08, droit à l'effacement) : mot de passe actuel ET case « définitif ». L'API refuse
 * tant qu'une commande, un remboursement ou une boutique est en cours ; au 3e mot de passe faux, la session est fermée.
 */
export function DeleteAccountForm() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (pending) return;
    if (password.length === 0) return setError("Saisissez votre mot de passe actuel.");
    if (!confirm) return setError("Cochez la case pour confirmer la suppression définitive.");
    setPending(true);
    setError(null);
    const result = await deleteAccountAction(password, true).catch((): DeleteAccountResult => ({
      ok: false,
      code: "INDISPONIBLE",
    }));
    setPending(false);
    setPassword("");
    if (result.ok) {
      router.push("/compte?supprime=1");
      router.refresh();
      return;
    }
    if (result.code === "SESSION_INVALIDE") {
      router.push("/connexion?retour=/compte");
      return;
    }
    setError(deletionErrorMessage(result.code, result.retryAfterSeconds));
  };

  return (
    <form
      onSubmit={submit}
      noValidate
      className="mt-4 max-w-md space-y-4"
      aria-labelledby="supprimer-compte"
    >
      <h3 id="supprimer-compte" className="font-bold">
        Supprimer mon compte
      </h3>
      <p className="text-ink-500 text-sm">
        Votre nom, vos coordonnées, vos adresses, votre panier et vos appareils connectés seront
        effacés tout de suite ; vos commandes sont anonymisées. Seules les factures restent
        conservées 10 ans telles qu&apos;elles ont été émises (obligation comptable). Cette action
        ne peut pas être annulée.
      </p>
      {error && <FormAlert>{error}</FormAlert>}
      <PasswordField
        label="Mot de passe actuel"
        name="delete-password"
        autoComplete="current-password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        maxLength={128}
      />
      <label className="flex items-start gap-3 text-sm">
        <input
          type="checkbox"
          checked={confirm}
          onChange={(e) => setConfirm(e.target.checked)}
          className="accent-brand-600 mt-0.5 size-5 shrink-0"
        />
        <span className="text-ink-700">
          Je comprends que la suppression de mon compte est définitive.
        </span>
      </label>
      <SubmitButton pending={pending}>Supprimer définitivement mon compte</SubmitButton>
    </form>
  );
}
