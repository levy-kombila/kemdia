import type { AdminReview, OwnReview, PublicReview } from "@kemdia/contracts";
import type { Review } from "../domain/review.js";

/** Avis publié : jamais le compte, l'identifiant ni l'état de modération. */
export function presentPublicReview(r: Review): PublicReview {
  return {
    rating: r.rating,
    comment: r.comment,
    authorName: r.authorName,
    verifiedPurchase: true,
    date: r.updatedAt.toISOString(),
  };
}

export function presentOwnReview(r: Review): OwnReview {
  return {
    rating: r.rating,
    comment: r.comment,
    status: r.status,
    rejectReason: r.rejectReason,
    date: r.updatedAt.toISOString(),
  };
}

export function presentAdminReview(
  r: Review,
  listing: { title: string; slug: string; image: string | null } | null,
): AdminReview {
  return {
    id: r.id,
    rating: r.rating,
    comment: r.comment,
    authorName: r.authorName,
    status: r.status,
    rejectReason: r.rejectReason,
    listing,
    date: r.updatedAt.toISOString(),
  };
}

/** Position opaque dans la file : date de modification et identifiant, en base64url. */
export function encodeReviewCursor(cursor: { updatedAt: Date; id: string }): string {
  return Buffer.from(JSON.stringify([cursor.updatedAt.toISOString(), cursor.id])).toString(
    "base64url",
  );
}

export function decodeReviewCursor(raw: string): { updatedAt: Date; id: string } | undefined {
  try {
    const value: unknown = JSON.parse(Buffer.from(raw, "base64url").toString("utf8"));
    if (!Array.isArray(value) || value.length !== 2) return undefined;
    const [date, id] = value as unknown[];
    if (typeof date !== "string" || typeof id !== "string") return undefined;
    const updatedAt = new Date(date);
    if (Number.isNaN(updatedAt.getTime())) return undefined;
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(id))
      return undefined;
    return { updatedAt, id };
  } catch {
    return undefined;
  }
}
