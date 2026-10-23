import { ReviewsError } from "./reviews-error.js";

/**
 * Avis d'un client sur une fiche produit (S8-T01, ADR-0056, FR-020). Règles pures, sans framework ni base.
 *
 * - Un avis par compte et par fiche, réservé à un client dont une commande contenant ce produit est LIVRÉE
 *   (vérifié par l'application) : « Achat vérifié » sur chaque avis.
 * - Note de 1 à 5 étoiles ; commentaire facultatif de 10 à 1 000 caractères.
 * - Note seule : publiée tout de suite (rien à modérer). Avec un commentaire : en attente de l'équipe Catalogue, qui
 *   publie ou refuse (motif montré à l'auteur). Modifier un avis le soumet de nouveau aux mêmes règles.
 * - Nom affiché figé à l'écriture : prénom et initiale du nom (« Awa N. »), jamais le nom complet.
 */

export const REVIEW_RULES = {
  ratingMin: 1,
  ratingMax: 5,
  commentMin: 10,
  commentMax: 1000,
  reasonMin: 5,
  reasonMax: 300,
} as const;

export type ReviewStatus = "pending" | "published" | "rejected";

export interface Review {
  id: string;
  listingId: string;
  accountId: string;
  rating: number;
  comment: string | null;
  authorName: string;
  status: ReviewStatus;
  rejectReason: string | null;
  reviewedBy: string | null;
  reviewedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const invalid = (message: string) => new ReviewsError("AVIS_INVALIDE", message);

// Caractères de contrôle (sauf le saut de ligne) et caractères invisibles de mise en forme : jamais utiles
const CONTROL = /[^\P{Cc}\n]/gu;
// Le liant sans chasse (U+200D) reste : il compose certains émojis
const INVISIBLE = /(?!\u200d)\p{Cf}/gu;

/** Texte nettoyé : caractères invisibles retirés, espaces resserrés, 2 sauts de ligne de suite au plus. */
export function cleanText(raw: string): string {
  return raw
    .normalize("NFC")
    .replace(/\r\n?/g, "\n")
    .replace(CONTROL, "")
    .replace(INVISIBLE, "")
    .replace(/[^\S\n]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function validateRating(value: unknown): number {
  if (
    typeof value !== "number" ||
    !Number.isInteger(value) ||
    value < REVIEW_RULES.ratingMin ||
    value > REVIEW_RULES.ratingMax
  ) {
    throw invalid("la note doit être un nombre entier d'étoiles, de 1 à 5");
  }
  return value;
}

/** Commentaire facultatif : vide → `null`. */
export function validateComment(raw: string | null | undefined): string | null {
  const text = cleanText(raw ?? "");
  if (!text) return null;
  const length = [...text].length;
  if (length < REVIEW_RULES.commentMin || length > REVIEW_RULES.commentMax) {
    throw invalid(
      `le commentaire doit faire de ${REVIEW_RULES.commentMin} à ${REVIEW_RULES.commentMax} caractères`,
    );
  }
  return text;
}

export function validateReason(raw: string): string {
  const text = cleanText(raw).replace(/\n+/g, " ");
  const length = [...text].length;
  if (length < REVIEW_RULES.reasonMin || length > REVIEW_RULES.reasonMax) {
    throw invalid(
      `le motif doit faire de ${REVIEW_RULES.reasonMin} à ${REVIEW_RULES.reasonMax} caractères`,
    );
  }
  return text;
}

/** « Awa N. » : prénom et initiale du nom (jamais le nom complet). */
export function authorNameOf(firstName: string, lastName: string): string {
  const first = firstName.trim().slice(0, 60) || "Client";
  const initial = [...lastName.trim()][0];
  return initial ? `${first} ${initial.toLocaleUpperCase("fr-FR")}.` : first;
}

/**
 * Nouvel avis ou avis modifié par son auteur : publié tout de suite sans commentaire, en attente sinon. La décision
 * précédente de l'équipe est oubliée (le texte a changé).
 */
export function writeReview(
  previous: Review | null,
  input: {
    id: string;
    listingId: string;
    accountId: string;
    rating: unknown;
    comment: string | null | undefined;
    authorName: string;
  },
  now: Date,
): Review {
  const rating = validateRating(input.rating);
  const comment = validateComment(input.comment);
  return {
    id: previous?.id ?? input.id,
    listingId: input.listingId,
    accountId: input.accountId,
    rating,
    comment,
    authorName: input.authorName,
    status: comment ? "pending" : "published",
    rejectReason: null,
    reviewedBy: null,
    reviewedAt: null,
    createdAt: previous?.createdAt ?? now,
    updatedAt: now,
  };
}

export type ReviewDecision = "publish" | "reject";

/** Décision de l'équipe Catalogue sur un avis en attente ; un refus a toujours un motif. */
export function moderate(
  review: Review,
  decision: ReviewDecision,
  by: { staffId: string; reason: string | null; now: Date; readVersion: string },
): Review {
  if (review.status !== "pending") {
    throw new ReviewsError("AVIS_DEJA_TRAITE", "cet avis n'attend plus de décision");
  }
  // L'équipe décide sur le texte qu'elle a lu, jamais sur une version modifiée entre-temps (relecture de sécurité)
  if (review.updatedAt.toISOString() !== by.readVersion) {
    throw new ReviewsError(
      "AVIS_MODIFIE",
      "l'auteur a modifié cet avis depuis que vous l'avez lu : relisez-le avant de décider",
    );
  }
  if (decision === "publish") {
    return { ...review, status: "published", reviewedBy: by.staffId, reviewedAt: by.now };
  }
  return {
    ...review,
    status: "rejected",
    rejectReason: validateReason(by.reason ?? ""),
    reviewedBy: by.staffId,
    reviewedAt: by.now,
  };
}

export interface ReviewSummary {
  /** Avis publiés */
  count: number;
  /** Moyenne arrondie au dixième ; 0 sans avis */
  average: number;
  /** Nombre d'avis publiés pour 1, 2, 3, 4 et 5 étoiles */
  distribution: [number, number, number, number, number];
}

/** Moyenne au dixième (4,25 → 4,3), 0 sans avis. */
export function averageOf(distribution: readonly number[]): { count: number; average: number } {
  const count = distribution.reduce((s, n) => s + n, 0);
  if (!count) return { count: 0, average: 0 };
  const total = distribution.reduce((s, n, i) => s + n * (i + 1), 0);
  return { count, average: Math.round((total / count) * 10) / 10 };
}
