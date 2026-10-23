"use client";

import { useActionState } from "react";
import {
  PROBLEM_CATEGORIES,
  PROBLEM_CATEGORY_LABELS,
  PROBLEM_LIMITS,
} from "@kemdia/contracts/constants";
import { FormAlert, SelectField, SubmitButton, TextAreaField } from "@/components/ui/Field";
import { reportProblemAction } from "@/lib/feedback/actions";

/**
 * « Signaler un problème » (S8-T02) : genre, description, et la page d'où vient le visiteur (chemin seulement).
 * Formulaire envoyé à une action serveur : fonctionne aussi sans JavaScript.
 */
export function ProblemForm({ page }: { page: string | null }) {
  const [state, action, pending] = useActionState(reportProblemAction, null);

  if (state?.ok) return <FormAlert tone="info">{state.message}</FormAlert>;

  return (
    <form action={action} className="space-y-4">
      {state && <FormAlert>{state.message}</FormAlert>}
      {page && <input type="hidden" name="page" value={page} />}
      <SelectField label="Genre de problème" name="category" defaultValue="bug" required>
        {PROBLEM_CATEGORIES.map((category) => (
          <option key={category} value={category}>
            {PROBLEM_CATEGORY_LABELS[category]}
          </option>
        ))}
      </SelectField>
      <TextAreaField
        label="Ce qui s'est passé"
        name="message"
        rows={6}
        required
        minLength={PROBLEM_LIMITS.messageMin}
        maxLength={PROBLEM_LIMITS.messageMax}
        hint="Ce que vous faisiez, ce que vous attendiez, ce qui s'est passé. N'écrivez jamais de mot de passe ni de code reçu."
      />
      {page && (
        <p className="text-ink-500 text-sm">
          Page concernée : <code className="break-all">{page}</code>
        </p>
      )}
      <SubmitButton pending={pending}>Envoyer le signalement</SubmitButton>
    </form>
  );
}
