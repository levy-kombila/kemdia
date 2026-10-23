import type { ReviewFailureCode } from "./api-reviews";

/** Messages en français des erreurs des avis (S8-T01). */
export const REVIEW_MESSAGES: Record<ReviewFailureCode, string> = {
  AVIS_INVALIDE:
    "Avis refusé : choisissez de 1 à 5 étoiles ; un commentaire fait de 10 à 1 000 caractères.",
  ACHAT_REQUIS: "Seuls les clients qui ont reçu ce produit peuvent donner leur avis.",
  AVIS_INTROUVABLE: "Vous n'avez pas d'avis sur ce produit.",
  AVIS_DEJA_TRAITE: "Cet avis a déjà été traité.",
  PRODUIT_INTROUVABLE: "Ce produit n'est plus en ligne.",
  SESSION_INVALIDE: "Votre session a expiré : reconnectez-vous.",
  TROP_DE_REQUETES: "Trop d'essais : patientez une minute.",
  INDISPONIBLE: "Service momentanément indisponible. Réessayez dans quelques instants.",
};

/** Commentaire facultatif : vide, ou de 10 à 1 000 caractères (revérifié par l'API). */
export function checkReview(
  rawRating: unknown,
  rawComment: unknown,
): { ok: true; rating: number; comment: string | null } | { ok: false; message: string } {
  const rating =
    typeof rawRating === "string" && /^[1-5]$/.test(rawRating) ? Number(rawRating) : NaN;
  if (!Number.isInteger(rating))
    return { ok: false, message: "Choisissez une note de 1 à 5 étoiles." };
  const comment = typeof rawComment === "string" ? rawComment.trim() : "";
  const length = [...comment].length;
  if (length > 0 && (length < 10 || length > 1000))
    return {
      ok: false,
      message: "Le commentaire doit faire de 10 à 1 000 caractères (ou restez sans commentaire).",
    };
  return { ok: true, rating, comment: comment || null };
}
