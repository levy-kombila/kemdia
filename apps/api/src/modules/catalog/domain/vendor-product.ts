import { CatalogError } from "./catalog-error.js";
import type { ProductStatus } from "./product.js";

/**
 * Produits des vendeurs et modération (S6-T02, ADR-0033). Règles pures, sans framework ni base.
 *
 *   création ─► PENDING ──valider──► PUBLISHED ──contenu modifié──► PENDING (caché jusqu'à la nouvelle validation)
 *                  │                     │
 *               refuser               archiver ──► ARCHIVED ──remettre en vente──► PENDING
 *                  ▼
 *               REJECTED ──contenu modifié──► PENDING
 *
 * Le prix, le prix barré, le stock et l'activation d'une variante changent SANS nouvelle modération (choix du
 * 2026-10-16). Le titre, la description, la marque et la catégorie font repasser le produit en modération.
 */

/** Longueurs et limites des produits d'un vendeur (mêmes valeurs que VENDOR_PRODUCT_LIMITS du contrat). */
export const VENDOR_PRODUCT_RULES = {
  titleMin: 5,
  titleMax: 120,
  descriptionMin: 30,
  descriptionMax: 5_000,
  brandMin: 2,
  brandMax: 60,
  variantsMax: 20,
  variantNameMax: 80,
  reasonMin: 5,
  reasonMax: 300,
} as const;

export interface VendorContentInput {
  title: string;
  description: string;
  brand?: string | null | undefined;
  categoryId: string;
}

/** Contenu soumis à la modération, nettoyé et vérifié. */
export interface VendorContent {
  title: string;
  description: string;
  brand: string | null;
  categoryId: string;
}

const invalid = (message: string) => new CatalogError("PRODUIT_INVALIDE", message);

// Caractères de contrôle (sauf le saut de ligne de la description) et invisibles de mise en forme : jamais utiles,
// utiles pour tromper un modérateur (texte caché, ordre d'affichage inversé).
const CONTROL = /[^\P{Cc}\n]/gu;
// \p{Cf} plus les caractères « blancs » qui n'en font pas partie : remplissages hangûl, blanc braille (relecture S6-T02)
const INVISIBLE = /[\p{Cf}\u115F\u1160\u3164\uFFA0\u2800]/gu;
/** Au moins une lettre ou un chiffre : un texte fait seulement de signes ou de blancs n'est pas un titre. */
const MEANINGFUL = /[\p{L}\p{N}]/u;

export function cleanLine(raw: string): string {
  return raw
    .normalize("NFC")
    .replace(INVISIBLE, "")
    .replace(/\s/g, " ")
    .replace(CONTROL, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function cleanText(raw: string): string {
  return raw
    .normalize("NFC")
    .replace(INVISIBLE, "")
    .replace(/\r\n?/g, "\n")
    .replace(/[^\S\n]/g, " ")
    .replace(CONTROL, "")
    .split("\n")
    .map((line) => line.replace(/\s+/g, " ").trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function length(value: string, min: number, max: number, label: string): string {
  const count = [...value].length;
  if (count < min || count > max) throw invalid(`${label} : entre ${min} et ${max} caractères`);
  if (!MEANINGFUL.test(value)) throw invalid(`${label} : au moins une lettre ou un chiffre`);
  return value;
}

export function validateContent(input: VendorContentInput): VendorContent {
  const R = VENDOR_PRODUCT_RULES;
  const title = length(cleanLine(input.title), R.titleMin, R.titleMax, "le titre");
  const description = length(
    cleanText(input.description),
    R.descriptionMin,
    R.descriptionMax,
    "la description",
  );
  const rawBrand = input.brand == null ? "" : cleanLine(input.brand);
  const brand = rawBrand === "" ? null : length(rawBrand, R.brandMin, R.brandMax, "la marque");
  return { title, description, brand, categoryId: input.categoryId.toLowerCase() };
}

/** Nom d'une variante (« Noir · 128 Go »), nettoyé. Deux variantes d'un produit n'ont pas le même nom. */
export function variantName(raw: string): string {
  return length(cleanLine(raw), 1, VENDOR_PRODUCT_RULES.variantNameMax, "le nom de la variante");
}

/**
 * Caractéristiques d'une variante : clés en minuscules (« couleur »), valeurs nettoyées. Deux clés identiques après
 * nettoyage (« Couleur » et « couleur ») sont refusées plutôt que l'une n'écrase l'autre en silence.
 */
export function variantAttributes(raw: Readonly<Record<string, string>>): Record<string, string> {
  const entries = Object.entries(raw).map(
    ([key, value]) => [cleanLine(key).toLowerCase(), cleanLine(value)] as const,
  );
  const keys = entries.map(([key]) => key);
  if (new Set(keys).size !== keys.length) {
    throw invalid("deux caractéristiques portent le même nom");
  }
  return Object.fromEntries(entries);
}

export function validateReason(raw: string): string {
  const R = VENDOR_PRODUCT_RULES;
  return length(cleanText(raw), R.reasonMin, R.reasonMax, "le motif");
}

/** État de modération d'un produit. */
export interface ModerationState {
  status: ProductStatus;
  moderationReason: string | null;
  submittedAt: Date | null;
  reviewedBy: string | null;
  reviewedAt: Date | null;
}

const incompatible = (status: ProductStatus, action: string) =>
  new CatalogError(
    "STATUT_PRODUIT_INCOMPATIBLE",
    `${action} impossible : le produit est « ${STATUS_LABELS[status]} »`,
  );

export const STATUS_LABELS: Readonly<Record<ProductStatus, string>> = {
  DRAFT: "en préparation",
  PENDING: "en attente de modération",
  PUBLISHED: "en ligne",
  REJECTED: "refusé",
  ARCHIVED: "archivé",
};

/** Nouvelle demande de modération : création, contenu modifié, remise en vente. */
function submitted(now: Date): ModerationState {
  return {
    status: "PENDING",
    moderationReason: null,
    submittedAt: now,
    // La décision précédente reste au journal d'audit
    reviewedBy: null,
    reviewedAt: null,
  };
}

export function onCreate(now: Date): ModerationState {
  return submitted(now);
}

/** Contenu modifié par le vendeur : le produit repasse en modération (et n'est plus visible en attendant). */
export function onContentChange(state: ModerationState, now: Date): ModerationState {
  if (state.status === "ARCHIVED") throw incompatible(state.status, "modification");
  return submitted(now);
}

export function onArchive(state: ModerationState): ModerationState {
  if (state.status === "ARCHIVED") throw incompatible(state.status, "archivage");
  return { ...state, status: "ARCHIVED", moderationReason: null };
}

export function onRestore(state: ModerationState, now: Date): ModerationState {
  if (state.status !== "ARCHIVED") throw incompatible(state.status, "remise en vente");
  return submitted(now);
}

export type ModerationDecision = "approve" | "reject";

/**
 * Décision d'un modérateur, seulement sur un produit en attente ; un refus a toujours un motif.
 * `seenSubmittedAt` : la demande que le modérateur a lue. Si le vendeur a renvoyé le produit depuis (contenu modifié),
 * la décision est refusée : on ne valide jamais un contenu que le modérateur n'a pas vu (relecture de sécurité S6-T02).
 */
export function moderate(
  state: ModerationState,
  decision: ModerationDecision,
  by: { moderatorId: string; reason: string | null; now: Date; seenSubmittedAt: Date },
): ModerationState {
  if (state.status !== "PENDING") {
    throw incompatible(state.status, decision === "approve" ? "validation" : "refus");
  }
  if (state.submittedAt?.getTime() !== by.seenSubmittedAt.getTime()) {
    throw new CatalogError(
      "PRODUIT_MODIFIE",
      "le vendeur a modifié ce produit depuis votre lecture : relisez-le avant de décider",
    );
  }
  return {
    status: decision === "approve" ? "PUBLISHED" : "REJECTED",
    moderationReason: decision === "approve" ? null : validateReason(by.reason ?? ""),
    submittedAt: state.submittedAt,
    reviewedBy: by.moderatorId,
    reviewedAt: by.now,
  };
}

/** Adresse lisible d'un produit de vendeur : tirée du titre, suivie d'un suffixe au hasard (jamais de doublon). */
export function vendorSlug(searchableTitle: string, suffix: string): string {
  const base = searchableTitle.replace(/ /g, "-").slice(0, 100).replace(/-+$/, "");
  return `${base || "produit"}-${suffix}`;
}
