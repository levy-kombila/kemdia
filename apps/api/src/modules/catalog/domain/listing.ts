import { CatalogError } from "./catalog-error.js";
import type { Product, ProductStatus, Variant } from "./product.js";
import { STATUS_LABELS, type ModerationState } from "./vendor-product.js";
import { searchable } from "./values.js";

/**
 * Fiche commune et offres (S7.5-T02, ADR-0049). Une FICHE décrit un produit (titre, description, marque, photos,
 * déclinaisons) ; chaque boutique y pose son OFFRE (prix, stock), qui est un `Product` du domaine. Le client voit une
 * seule fiche par produit, avec toutes les offres, et l'offre « mise en avant » (bouton « Ajouter au panier »).
 */

/** Boutique telle que le client la voit à côté d'une offre. */
export interface Seller {
  name: string;
  slug: string;
  city: string;
}

/** Contenu public d'une fiche. */
export interface ListingContent {
  id: string;
  slug: string;
  title: string;
  description: string;
  brand: string | null;
  categoryId: string;
  images: readonly string[];
  rating: number;
  reviewCount: number;
  isFeatured: boolean;
  isBestseller: boolean;
  isNew: boolean;
}

export interface ListingVariantInfo {
  id: string;
  name: string;
  attributes: Readonly<Record<string, string>>;
}

/** Une variante d'offre candidate à la mise en avant. */
export interface OfferCandidate {
  offer: Product;
  variant: Variant;
  seller: Seller | null;
}

/**
 * Offre mise en avant (choix du 2026-10-20) : d'abord une offre EN STOCK, puis la moins chère, puis, à prix égal, une
 * boutique de la ville du client ; enfin l'identifiant de l'offre (même réponse à chaque appel). Sans offre en stock,
 * la moins chère.
 */
export function pickOffer(
  candidates: readonly OfferCandidate[],
  city?: string | null,
): OfferCandidate | null {
  const near = city ? searchable(city) : "";
  const rank = (c: OfferCandidate) => [
    c.variant.stock > 0 ? 0 : 1,
    c.variant.price,
    near && c.seller && searchable(c.seller.city) === near ? 0 : 1,
  ];
  let best: OfferCandidate | null = null;
  for (const candidate of candidates) {
    if (!best) {
      best = candidate;
      continue;
    }
    const a = rank(candidate);
    const b = rank(best);
    const diff = a.findIndex((value, i) => value !== b[i]);
    if (
      diff >= 0 ? (a[diff] as number) < (b[diff] as number) : candidate.offer.id < best.offer.id
    ) {
      best = candidate;
    }
  }
  return best;
}

/** Une déclinaison telle que le client la choisit, avec l'offre mise en avant pour elle. */
export interface ListingChoice {
  listingVariant: ListingVariantInfo;
  best: OfferCandidate;
}

/**
 * Fiche visible et ses offres visibles. Construite seulement avec des offres VISIBLES (publiées, boutique non suspendue,
 * fiche publiée) ; leurs variantes inactives sont ignorées.
 */
export class ListingOffers {
  readonly choices: readonly ListingChoice[];
  readonly main: OfferCandidate;
  readonly offers: readonly { offer: Product; seller: Seller | null }[];

  private constructor(
    readonly content: ListingContent,
    choices: ListingChoice[],
    main: OfferCandidate,
    offers: { offer: Product; seller: Seller | null }[],
  ) {
    this.choices = Object.freeze(choices);
    this.main = main;
    this.offers = Object.freeze(offers);
  }

  /** `null` si aucune offre visible n'a de variante active (la fiche n'est alors pas montrée). */
  static build(input: {
    content: ListingContent;
    variants: readonly ListingVariantInfo[];
    offers: readonly Product[];
    sellers: ReadonlyMap<string, Seller>;
    city?: string | null | undefined;
  }): ListingOffers | null {
    const visible = input.offers.filter((o) => o.isVisible && o.listingId === input.content.id);
    const candidates: OfferCandidate[] = visible.flatMap((offer) =>
      offer.variants
        .filter((v) => v.isActive)
        .map((variant) => ({ offer, variant, seller: input.sellers.get(offer.shopId) ?? null })),
    );
    const main = pickOffer(candidates, input.city);
    if (!main) return null;
    const choices: ListingChoice[] = [];
    for (const listingVariant of input.variants) {
      const best = pickOffer(
        candidates.filter((c) => c.variant.listingVariantId === listingVariant.id),
        input.city,
      );
      if (best) choices.push({ listingVariant, best });
    }
    // Offres dans l'ordre de leur meilleure variante (en stock, prix, ville)
    const offers = visible
      .map((offer) => ({
        offer,
        seller: input.sellers.get(offer.shopId) ?? null,
        best: pickOffer(
          candidates.filter((c) => c.offer === offer),
          input.city,
        ),
      }))
      .filter((o) => o.best !== null);
    const order = new Map(offers.map((o) => [o.offer.id, o.best as OfferCandidate] as const));
    offers.sort((a, b) => {
      const winner = pickOffer([order.get(a.offer.id)!, order.get(b.offer.id)!], input.city);
      return winner?.offer === a.offer ? -1 : 1;
    });
    return new ListingOffers(
      input.content,
      choices,
      main,
      offers.map(({ offer, seller }) => ({ offer, seller })),
    );
  }

  /** Stock total commandable, toutes offres confondues. */
  get totalStock(): number {
    return this.offers.reduce(
      (sum, { offer }) =>
        sum + offer.variants.filter((v) => v.isActive).reduce((s, v) => s + v.stock, 0),
      0,
    );
  }

  get inStock(): boolean {
    return this.main.variant.stock > 0;
  }
}

// --- Statut d'une offre posée sur une fiche publiée (choix du 2026-10-20) ---

const incompatible = (status: ProductStatus, action: string) =>
  new CatalogError(
    "STATUT_PRODUIT_INCOMPATIBLE",
    `${action} impossible : l'offre est « ${STATUS_LABELS[status]} »`,
  );

/** Offre sur une fiche déjà publiée : en ligne tout de suite (rien à modérer : ni texte, ni photo). */
export function onOfferCreate(): ModerationState {
  return {
    status: "PUBLISHED",
    moderationReason: null,
    submittedAt: null,
    reviewedBy: null,
    reviewedAt: null,
  };
}

/**
 * Remise en vente d'une offre sur une fiche publiée : une offre archivée par son vendeur revient en ligne tout de
 * suite ; une offre RETIRÉE par l'équipe repasse par la modération (jamais remise en ligne sans elle).
 */
export function onOfferRestore(state: ModerationState, now: Date): ModerationState {
  if (state.status === "ARCHIVED") return onOfferCreate();
  if (state.status === "REJECTED") {
    return {
      status: "PENDING",
      moderationReason: null,
      submittedAt: now,
      reviewedBy: null,
      reviewedAt: null,
    };
  }
  throw incompatible(state.status, "remise en vente");
}

/** Archivage par le vendeur d'une offre sur une fiche publiée : pas pour une offre retirée par l'équipe. */
export function onOfferArchive(state: ModerationState): ModerationState {
  if (state.status === "ARCHIVED" || state.status === "REJECTED") {
    throw incompatible(state.status, "archivage");
  }
  return { ...state, status: "ARCHIVED", moderationReason: null };
}

/**
 * Offre retirée par l'équipe (prix abusif, contrefaçon…) : refusée avec un motif, que le vendeur voit. Une offre de la
 * boutique Kemdia n'est jamais « refusée » (règle de la base) : elle est archivée.
 */
export function onOfferWithdraw(
  state: ModerationState,
  by: { moderatorId: string; reason: string; now: Date; kemdia: boolean },
): ModerationState {
  if (state.status === "ARCHIVED" || state.status === "REJECTED") {
    throw incompatible(state.status, "retrait");
  }
  if (by.kemdia) return { ...state, status: "ARCHIVED", moderationReason: null };
  return {
    status: "REJECTED",
    moderationReason: by.reason,
    submittedAt: state.submittedAt,
    reviewedBy: by.moderatorId,
    reviewedAt: by.now,
  };
}
