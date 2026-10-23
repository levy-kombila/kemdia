"use server";

import { revalidatePath } from "next/cache";
import { SLUG_PATTERN } from "@kemdia/contracts/constants";
import { sessionToken } from "@/lib/orders/orders";
import { REVIEW_MESSAGES, checkReview } from "./messages";
import { reviewsApi } from "./reviews";

export type ReviewFormState = { ok: boolean; message: string } | null;

const slugOf = (form: FormData) => {
  const slug = form.get("slug");
  return typeof slug === "string" && SLUG_PATTERN.test(slug) && slug.length <= 120 ? slug : null;
};

/** Donner ou modifier son avis (S8-T01) : revérifié ici, puis par l'API (achat livré, longueurs). */
export async function writeReviewAction(
  _previous: ReviewFormState,
  form: FormData,
): Promise<ReviewFormState> {
  const slug = slugOf(form);
  if (!slug) return { ok: false, message: REVIEW_MESSAGES.PRODUIT_INTROUVABLE };
  const token = await sessionToken();
  if (!token) return { ok: false, message: REVIEW_MESSAGES.SESSION_INVALIDE };
  const checked = checkReview(form.get("rating"), form.get("comment"));
  if (!checked.ok) return { ok: false, message: checked.message };
  const result = await reviewsApi().write(token, slug, {
    rating: checked.rating,
    comment: checked.comment,
  });
  if (!result.ok) return { ok: false, message: REVIEW_MESSAGES[result.code] };
  reviewsApi().forget(slug);
  revalidatePath(`/produit/${slug}`);
  return {
    ok: true,
    message:
      result.data.status === "published"
        ? "Merci ! Votre avis est publié."
        : "Merci ! Votre commentaire sera publié après une relecture par l'équipe Kemdia.",
  };
}

export async function removeReviewAction(
  _previous: ReviewFormState,
  form: FormData,
): Promise<ReviewFormState> {
  const slug = slugOf(form);
  if (!slug) return { ok: false, message: REVIEW_MESSAGES.PRODUIT_INTROUVABLE };
  const token = await sessionToken();
  if (!token) return { ok: false, message: REVIEW_MESSAGES.SESSION_INVALIDE };
  const result = await reviewsApi().remove(token, slug);
  if (!result.ok) return { ok: false, message: REVIEW_MESSAGES[result.code] };
  reviewsApi().forget(slug);
  revalidatePath(`/produit/${slug}`);
  return { ok: true, message: "Votre avis a été retiré." };
}
