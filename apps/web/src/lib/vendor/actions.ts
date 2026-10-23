"use server";

import { ORDER_REFERENCE_PATTERN, VENDOR_ORDER_REFUSAL_LIMITS } from "@kemdia/contracts/constants";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SESSION_COOKIE, expiredCookieOptions } from "@/lib/auth/cookies";
import { forgetSession } from "@/lib/auth/session";
import type { VendorFailure } from "./api-vendor";
import {
  checkContent,
  checkShopProfile,
  checkShopRequest,
  checkVariants,
  parseAmount,
  STOCK_MAX,
  type ProductErrors,
} from "./forms";
import { isUuid, photoIdOf } from "./images";
import { vendorErrorMessage, type VendorNotice } from "./messages";
import { sessionToken, vendorApi } from "./vendor";

/**
 * Actions serveur de l'espace vendeur (S6-T06, ADR-0037). Points d'entrée PUBLICS : chaque argument est revérifié ici
 * (type, longueur, forme), puis l'API refait toutes les règles (rôle vendeur, boutique active, produit de SA boutique,
 * modération). Le jeton de session ne quitte jamais le serveur.
 */

export type VendorFormFailure = {
  ok: false;
  message: string;
  errors?: ProductErrors | Record<string, string>;
  signedOut?: boolean;
};

async function failure(token: string, result: VendorFailure): Promise<VendorFormFailure> {
  if (result.code === "SESSION_INVALIDE") {
    forgetSession(token);
    (await cookies()).set(SESSION_COOKIE, "", expiredCookieOptions());
    return { ok: false, message: vendorErrorMessage(result.code), signedOut: true };
  }
  return { ok: false, message: vendorErrorMessage(result.code, result.detail) };
}

const signedOut: VendorFormFailure = {
  ok: false,
  message: vendorErrorMessage("SESSION_INVALIDE"),
  signedOut: true,
};
const invalid = (errors: VendorFormFailure["errors"]): VendorFormFailure => ({
  ok: false,
  message: "Vérifiez les champs signalés.",
  errors,
});

// --- Demande de boutique (formulaire avec JavaScript : erreurs par champ) ---

export async function applyShopAction(input: unknown): Promise<{ ok: true } | VendorFormFailure> {
  const token = await sessionToken();
  if (!token) return signedOut;
  const checked = checkShopRequest(input);
  if (!checked.ok) return invalid(checked.errors);
  const result = await vendorApi().applyShop(token, checked.value);
  if (!result.ok) {
    if (result.code === "NOM_BOUTIQUE_PRIS")
      return invalid({ name: vendorErrorMessage(result.code) });
    return failure(token, result);
  }
  return { ok: true };
}

/** « Ma boutique » (S7.5-T07) : ville, quartier et description ; le nom ne change pas ici. */
export async function updateShopProfileAction(
  input: unknown,
): Promise<{ ok: true } | VendorFormFailure> {
  const token = await sessionToken();
  if (!token) return signedOut;
  const checked = checkShopProfile(input);
  if (!checked.ok) return invalid(checked.errors);
  const result = await vendorApi().updateShop(token, checked.value);
  if (!result.ok) return failure(token, result);
  // La page publique de la boutique et l'annuaire se mettent à jour (cache du site : 60 s au plus)
  return { ok: true };
}

// --- Produit : création et fiche (formulaire avec JavaScript : variantes, erreurs par champ) ---

export async function createProductAction(
  input: unknown,
): Promise<{ ok: true; id: string } | VendorFormFailure> {
  const token = await sessionToken();
  if (!token) return signedOut;
  const raw = (input ?? {}) as Record<string, unknown>;
  const content = checkContent(raw);
  const variants = checkVariants(raw.variants);
  if (!content.ok || !variants.ok)
    return invalid({
      ...(content.ok ? {} : content.errors),
      ...(variants.ok ? {} : variants.errors),
    });
  const result = await vendorApi().createProduct(token, {
    ...content.value,
    variants: variants.value,
  });
  if (!result.ok) return failure(token, result);
  return { ok: true, id: result.data.id };
}

export async function updateContentAction(
  productId: unknown,
  input: unknown,
): Promise<{ ok: true } | VendorFormFailure> {
  const token = await sessionToken();
  if (!token) return signedOut;
  if (!isUuid(productId)) return { ok: false, message: vendorErrorMessage("PRODUIT_INTROUVABLE") };
  const content = checkContent(input);
  if (!content.ok) return invalid(content.errors);
  const result = await vendorApi().updateContent(token, productId, content.value);
  if (!result.ok) return failure(token, result);
  return { ok: true };
}

// --- Actions par formulaire HTML simple (marchent sans JavaScript) : retour à la fiche avec un code ---

const field = (form: FormData, name: string, max = 40) => {
  const value = form.get(name);
  return typeof value === "string" && value.length <= max ? value : null;
};

async function productPage(form: FormData): Promise<{ token: string; id: string; page: string }> {
  const id = field(form, "productId");
  if (!id || !isUuid(id)) redirect("/vendeur/produits");
  const page = `/vendeur/produits/${id.toLowerCase()}`;
  const token = await sessionToken();
  if (!token) redirect(`/connexion?retour=${encodeURIComponent(page)}`);
  return { token, id: id.toLowerCase(), page };
}

async function after(
  token: string,
  page: string,
  result: { ok: true } | VendorFailure,
  notice: VendorNotice,
): Promise<never> {
  if (!result.ok) {
    if (result.code === "SESSION_INVALIDE") {
      forgetSession(token);
      (await cookies()).set(SESSION_COOKIE, "", expiredCookieOptions());
      redirect(`/connexion?retour=${encodeURIComponent(page)}`);
    }
    // Boutique suspendue entre-temps : l'accueil de l'espace explique pourquoi
    if (result.code === "ACCES_REFUSE" || result.code === "BOUTIQUE_INACTIVE") redirect("/vendeur");
    redirect(`${page}?erreur=${result.code}`);
  }
  redirect(`${page}?ok=${notice}`);
}

/** Prix, prix barré, stock (avec le stock lu avant : jamais écrasé) et mise en vente d'une variante. */
export async function updateVariantAction(form: FormData): Promise<never> {
  const { token, id, page } = await productPage(form);
  const variantId = field(form, "variantId");
  const price = parseAmount(field(form, "price", 20));
  const compareAtPrice = parseAmount(field(form, "compareAtPrice", 20));
  const stock = parseAmount(field(form, "stock", 20), STOCK_MAX);
  const previousStock = parseAmount(field(form, "previousStock", 20), STOCK_MAX);
  if (
    !variantId ||
    !isUuid(variantId) ||
    price === null ||
    Number.isNaN(price) ||
    price <= 0 ||
    Number.isNaN(compareAtPrice) ||
    (compareAtPrice !== null && compareAtPrice <= price) ||
    stock === null ||
    Number.isNaN(stock) ||
    previousStock === null ||
    Number.isNaN(previousStock)
  )
    redirect(`${page}?erreur=PRODUIT_INVALIDE`);
  const result = await vendorApi().updateVariant(token, id, variantId, {
    price,
    compareAtPrice,
    isActive: form.get("isActive") === "on",
    // Stock envoyé seulement s'il a changé, avec la valeur lue : l'API refuse si une commande l'a modifié entre-temps
    ...(stock !== previousStock ? { stock, previousStock } : {}),
  });
  return after(token, page, result, "variante-modifiee");
}

// --- Fiches communes et offres (S7.5-T03) ---

/** Lignes « je vends cette déclinaison » d'un formulaire d'offre (au plus 20, montants vérifiés). */
/** Prix, prix barré et stock d'une ligne (`price<suffixe>`…), vérifiés ; `null` si l'un est faux. */
function amounts(
  form: FormData,
  suffix: string,
): { price: number; compareAtPrice: number | null; stock: number } | null {
  const price = parseAmount(field(form, `price${suffix}`, 20));
  const compareAtPrice = parseAmount(field(form, `compareAtPrice${suffix}`, 20));
  const stock = parseAmount(field(form, `stock${suffix}`, 20), STOCK_MAX);
  if (
    price === null ||
    Number.isNaN(price) ||
    price <= 0 ||
    Number.isNaN(compareAtPrice) ||
    (compareAtPrice !== null && compareAtPrice <= price) ||
    stock === null ||
    Number.isNaN(stock)
  )
    return null;
  return { price, compareAtPrice, stock };
}

/** Lignes cochées « je vends cette déclinaison » d'un formulaire d'offre (au plus 20) ; `null` si un montant est faux. */
function offerLines(form: FormData, ids: readonly string[]) {
  const lines: {
    listingVariantId: string;
    price: number;
    compareAtPrice: number | null;
    stock: number;
  }[] = [];
  for (const id of ids.slice(0, 20)) {
    if (!isUuid(id) || form.get(`sell-${id}`) !== "on") continue;
    const line = amounts(form, `-${id}`);
    if (!line) return null;
    lines.push({ listingVariantId: id.toLowerCase(), ...line });
  }
  return lines;
}

/** « Vendre ce produit » : offre de la boutique sur une fiche en ligne, en ligne tout de suite. */
export async function createOfferAction(form: FormData): Promise<never> {
  const listingId = field(form, "listingId");
  if (!listingId || !isUuid(listingId)) redirect("/vendeur/produits/nouveau");
  const page = `/vendeur/fiches/${listingId.toLowerCase()}`;
  const token = await sessionToken();
  if (!token) redirect(`/connexion?retour=${encodeURIComponent(page)}`);
  const ids = form.getAll("variantIds").filter((v): v is string => typeof v === "string");
  const lines = offerLines(form, ids);
  if (!lines) redirect(`${page}?erreur=PRODUIT_INVALIDE`);
  if (lines.length === 0) redirect(`${page}?erreur=DECLINAISON_INTROUVABLE`);
  const result = await vendorApi().createOffer(token, listingId, lines);
  if (!result.ok) return after(token, page, result, "offre-creee");
  redirect(`/vendeur/produits/${result.data.id}?ok=offre-creee`);
}

/** Nouvelle déclinaison de la fiche dans l'offre (sans modération). */
export async function addOfferVariantAction(form: FormData): Promise<never> {
  const { token, id, page } = await productPage(form);
  const listingVariantId = field(form, "listingVariantId");
  if (!listingVariantId || !isUuid(listingVariantId))
    redirect(`${page}?erreur=DECLINAISON_INTROUVABLE`);
  const line = amounts(form, "");
  if (!line) redirect(`${page}?erreur=PRODUIT_INVALIDE`);
  return after(
    token,
    page,
    await vendorApi().addOfferVariant(token, id, {
      listingVariantId: listingVariantId.toLowerCase(),
      ...line,
    }),
    "declinaison-ajoutee",
  );
}

/** Correction proposée à l'équipe pour la fiche en ligne (message libre, vérifié par l'API). */
export async function proposeCorrectionAction(form: FormData): Promise<never> {
  const { token, id, page } = await productPage(form);
  const message = field(form, "message", 1_000)?.trim() ?? "";
  const length = [...message].length;
  if (length < 10 || length > 500) redirect(`${page}?erreur=PRODUIT_INVALIDE`);
  return after(
    token,
    page,
    await vendorApi().proposeCorrection(token, id, message),
    "correction-envoyee",
  );
}

export async function archiveProductAction(form: FormData): Promise<never> {
  const { token, id, page } = await productPage(form);
  return after(token, page, await vendorApi().archive(token, id), "produit-archive");
}

export async function restoreProductAction(form: FormData): Promise<never> {
  const { token, id, page } = await productPage(form);
  const result = await vendorApi().restore(token, id);
  // Offre sur une fiche en ligne : de nouveau en ligne tout de suite (S7.5-T02)
  return after(
    token,
    page,
    result,
    result.ok && result.data.status === "published" ? "offre-remise" : "produit-remis",
  );
}

/** Photo principale : l'ordre est relu dans l'API (jamais reçu du navigateur), la photo choisie passe en premier. */
export async function mainPhotoAction(form: FormData): Promise<never> {
  const { token, id, page } = await productPage(form);
  const imageId = field(form, "imageId");
  if (!imageId || !isUuid(imageId)) redirect(`${page}?erreur=PHOTO_INTROUVABLE`);
  const current = await vendorApi().product(token, id);
  if (!current.ok) return after(token, page, current, "photo-principale");
  const ids = current.data.images.map(photoIdOf).filter((x): x is string => x !== null);
  const wanted = imageId.toLowerCase();
  if (!ids.includes(wanted)) redirect(`${page}?erreur=PHOTO_INTROUVABLE`);
  const result = await vendorApi().reorderImages(token, id, [
    wanted,
    ...ids.filter((x) => x !== wanted),
  ]);
  return after(token, page, result, "photo-principale");
}

export async function removePhotoAction(form: FormData): Promise<never> {
  const { token, id, page } = await productPage(form);
  const imageId = field(form, "imageId");
  if (!imageId || !isUuid(imageId)) redirect(`${page}?erreur=PHOTO_INTROUVABLE`);
  return after(token, page, await vendorApi().removeImage(token, id, imageId), "photo-retiree");
}

// --- Commandes (S6-T07, BR-013) : formulaires HTML simples, retour à la fiche de la commande ---

async function orderPage(
  form: FormData,
): Promise<{ token: string; reference: string; page: string }> {
  const reference = field(form, "reference", 20);
  if (!reference || !ORDER_REFERENCE_PATTERN.test(reference)) redirect("/vendeur/commandes");
  const page = `/vendeur/commandes/${reference}`;
  const token = await sessionToken();
  if (!token) redirect(`/connexion?retour=${encodeURIComponent(page)}`);
  return { token, reference, page };
}

export async function acceptOrderAction(form: FormData): Promise<never> {
  const { token, reference, page } = await orderPage(form);
  return after(token, page, await vendorApi().acceptOrder(token, reference), "commande-acceptee");
}

/** Refus : motif obligatoire (gardé par Kemdia, jamais montré au client) ; la commande ENTIÈRE est annulée. */
export async function refuseOrderAction(form: FormData): Promise<never> {
  const { token, reference, page } = await orderPage(form);
  const raw = field(form, "reason", VENDOR_ORDER_REFUSAL_LIMITS.max * 2);
  const reason = raw?.trim() ?? "";
  // Compté en caractères (comme l'API), pas en unités UTF-16
  const length = [...reason].length;
  if (length < VENDOR_ORDER_REFUSAL_LIMITS.min || length > VENDOR_ORDER_REFUSAL_LIMITS.max)
    redirect(`${page}?erreur=MOTIF_REFUS_INVALIDE`);
  return after(
    token,
    page,
    await vendorApi().refuseOrder(token, reference, reason),
    "commande-refusee",
  );
}

// --- Dossier de vérification, KYC (S6-T08, BR-024) : formulaires HTML simples ---

const KYC_PAGE = "/vendeur/verification";
/** Champ en cause d'un `KYC_INVALIDE`, reconnu au début de l'explication de l'API (liste fermée). */
const KYC_FIELDS: [string, string][] = [
  ["nom sur la pièce", "legalName"],
  ["numéro de la pièce", "idNumber"],
  ["numéro RCCM", "rccmNumber"],
  ["titulaire du compte", "payoutHolder"],
  ["compte", "payoutAccount"],
];
const oneOf = <T extends string>(value: string | null, allowed: readonly T[]): T | null =>
  allowed.find((a) => a === value) ?? null;

export async function saveKycAction(form: FormData): Promise<never> {
  const token = await sessionToken();
  if (!token) redirect(`/connexion?retour=${encodeURIComponent(KYC_PAGE)}`);
  const holderKind = oneOf(field(form, "holderKind", 20), ["individual", "company"] as const);
  const idType = oneOf(field(form, "idType", 20), ["cni", "passeport", "carte_sejour"] as const);
  const payoutMethod = oneOf(field(form, "payoutMethod", 20), ["airtel", "moov", "bank"] as const);
  const legalName = field(form, "legalName", 200);
  const idNumber = field(form, "idNumber", 60);
  const rccm = field(form, "rccmNumber", 80);
  const payoutAccount = field(form, "payoutAccount", 70);
  const payoutHolder = field(form, "payoutHolder", 200);
  if (
    !holderKind ||
    !idType ||
    !payoutMethod ||
    legalName === null ||
    idNumber === null ||
    payoutAccount === null ||
    payoutHolder === null
  )
    redirect(`${KYC_PAGE}?erreur=KYC_INVALIDE`);
  const result = await vendorApi().saveKyc(token, {
    holderKind,
    legalName,
    idType,
    idNumber,
    // Le RCCM ne vaut que pour une entreprise : ignoré sinon (le champ peut rester rempli à l'écran)
    rccmNumber: holderKind === "company" ? (rccm ?? "") : null,
    payoutMethod,
    payoutAccount,
    payoutHolder,
  });
  if (!result.ok && result.code === "KYC_INVALIDE") {
    // L'API met une majuscule au début de l'explication : comparaison sans tenir compte des majuscules
    const detail = (result.detail ?? "").toLowerCase();
    const key = KYC_FIELDS.find(([start]) => detail.startsWith(start.toLowerCase()))?.[1];
    redirect(`${KYC_PAGE}?erreur=KYC_INVALIDE${key ? `&champ=${key}` : ""}`);
  }
  return after(token, KYC_PAGE, result, "kyc-enregistre");
}

export async function submitKycAction(): Promise<never> {
  const token = await sessionToken();
  if (!token) redirect(`/connexion?retour=${encodeURIComponent(KYC_PAGE)}`);
  return after(token, KYC_PAGE, await vendorApi().submitKyc(token), "kyc-envoye");
}
