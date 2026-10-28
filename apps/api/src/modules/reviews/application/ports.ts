import type { Review, ReviewStatus, ReviewSummary } from "../domain/review.js";

export const REVIEW_REPOSITORY = Symbol("ReviewRepository");
export const REVIEW_LISTINGS = Symbol("ReviewListings");
export const REVIEW_PURCHASES = Symbol("ReviewPurchases");
export const REVIEWS_TRANSACTION = Symbol("ReviewsTransaction");
export const REVIEWS_RANDOM = Symbol("ReviewsRandom");

export interface ReviewCursor {
  updatedAt: Date;
  id: string;
}

/** Avis rangés (schéma `reviews`) ; les écritures rejoignent la transaction en cours. */
export interface ReviewRepository {
  findMine(listingId: string, accountId: string): Promise<Review | null>;
  /** Lit un avis sans le verrouiller (pour verrouiller d'abord sa fiche). */
  findById(id: string): Promise<Review | null>;
  /** Lit et verrouille un avis jusqu'à la fin de la transaction (décisions concurrentes). */
  lockById(id: string): Promise<Review | null>;
  /** Crée ou remplace l'avis (un par compte et par fiche). */
  save(review: Review): Promise<void>;
  /** Supprime l'avis du compte sur cette fiche ; `false` s'il n'y en avait pas. */
  delete(listingId: string, accountId: string): Promise<boolean>;
  /** Avis publiés d'une fiche, du plus récent au plus ancien. */
  published(
    listingId: string,
    page: number,
    pageSize: number,
  ): Promise<{ items: Review[]; total: number }>;
  summary(listingId: string): Promise<ReviewSummary>;
  /** File de l'équipe : du plus ancien au plus récent, `limit` au plus. */
  list(query: {
    status: ReviewStatus;
    limit: number;
    after?: ReviewCursor | undefined;
  }): Promise<{ items: Review[]; next: ReviewCursor | null }>;
  /** Avis d'un compte (copie des données personnelles). */
  ofAccount(accountId: string): Promise<Review[]>;
  /** Efface tous les avis d'un compte ; renvoie les fiches touchées. */
  deleteOfAccount(accountId: string): Promise<string[]>;
}

/** Fiches vues par le module (catalog, par son port public). */
export interface ReviewListings {
  /** Fiche PUBLIÉE par son adresse, avec ses offres (pour vérifier l'achat) ; `null` sinon. */
  findPublished(
    slug: string,
  ): Promise<{ listingId: string; title: string; offerIds: string[] } | null>;
  /** Fiche par son adresse quel que soit son état, en suivant une fusion (voir ou retirer son avis). */
  findAny(slug: string): Promise<{ listingId: string; published: boolean } | null>;
  /** Verrouille la fiche jusqu'à la fin de la transaction (changements d'avis simultanés). */
  lock(listingId: string): Promise<void>;
  /** Titre et adresse de fiches (file de l'équipe), même non publiées. */
  describe(
    listingIds: readonly string[],
  ): Promise<Map<string, { title: string; slug: string; image: string | null }>>;
  /** Note moyenne et nombre d'avis publiés, montrés sur les cartes et la fiche. */
  setRating(listingId: string, average: number, count: number): Promise<void>;
}

/** Achats vérifiés (orders, par son port public). */
export interface ReviewPurchases {
  /** Une commande du compte contenant l'une de ces offres est-elle livrée ? */
  hasDelivered(accountId: string, productIds: readonly string[]): Promise<boolean>;
}

export interface ReviewsTransaction {
  run<T>(work: () => Promise<T>): Promise<T>;
}

export interface ReviewsRandom {
  uuid(): string;
}
