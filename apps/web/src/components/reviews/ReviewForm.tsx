"use client";

import { useActionState, useState } from "react";
import type { OwnReview } from "@kemdia/contracts";
import { FormAlert, SubmitButton, TextAreaField } from "@/components/ui/Field";
import { removeReviewAction, writeReviewAction } from "@/lib/reviews/actions";

const STATUS: Record<OwnReview["status"], string> = {
  published: "Publié",
  pending: "En relecture par l'équipe Kemdia",
  rejected: "Refusé",
};

/**
 * Donner ou modifier son avis (S8-T01) : étoiles (boutons radio, utilisables au clavier) et commentaire facultatif.
 * Formulaire envoyé à une action serveur : fonctionne aussi sans JavaScript.
 */
export function ReviewForm({ slug, mine }: { slug: string; mine: OwnReview | null }) {
  const [state, action, pending] = useActionState(writeReviewAction, null);
  const [removed, removeAction, removing] = useActionState(removeReviewAction, null);
  const [rating, setRating] = useState(mine?.rating ?? 0);
  const done = state ?? removed;

  return (
    <div className="bg-ink-50 mt-4 space-y-3 rounded-xl p-4">
      <h3 className="font-bold">{mine ? "Mon avis" : "Donner mon avis"}</h3>
      {mine && (
        <p className="text-sm">
          État : <strong>{STATUS[mine.status]}</strong>
          {mine.status === "rejected" && mine.rejectReason && <> — motif : {mine.rejectReason}</>}
        </p>
      )}
      {done &&
        (done.ok ? (
          <FormAlert tone="info">{done.message}</FormAlert>
        ) : (
          <FormAlert>{done.message}</FormAlert>
        ))}
      <form action={action} className="space-y-3">
        <input type="hidden" name="slug" value={slug} />
        <fieldset>
          <legend className="text-ink-800 mb-1.5 text-sm font-semibold">Note</legend>
          <div className="flex gap-1">
            {[1, 2, 3, 4, 5].map((n) => (
              <label key={n} className="cursor-pointer">
                <input
                  type="radio"
                  name="rating"
                  value={n}
                  checked={rating === n}
                  onChange={() => setRating(n)}
                  className="peer sr-only"
                  required
                />
                <span
                  aria-hidden
                  className={`peer-focus-visible:ring-brand-100 rounded text-3xl leading-none peer-focus-visible:ring-4 ${n <= rating ? "text-accent-500" : "text-ink-300"}`}
                >
                  ★
                </span>
                <span className="sr-only">
                  {n} étoile{n > 1 ? "s" : ""}
                </span>
              </label>
            ))}
          </div>
        </fieldset>
        <TextAreaField
          label="Commentaire (facultatif)"
          name="comment"
          rows={4}
          maxLength={1000}
          defaultValue={mine?.comment ?? ""}
          hint="10 à 1 000 caractères. Il est lu par l'équipe Kemdia avant d'être publié ; la note seule est publiée tout de suite."
        />
        <SubmitButton pending={pending}>
          {mine ? "Modifier mon avis" : "Publier mon avis"}
        </SubmitButton>
      </form>
      {mine && (
        <form action={removeAction}>
          <input type="hidden" name="slug" value={slug} />
          <button
            type="submit"
            disabled={removing}
            className="text-ink-600 text-sm font-semibold underline"
          >
            Retirer mon avis
          </button>
        </form>
      )}
    </div>
  );
}
