"use server";

import {
  OTP_CODE_PATTERN,
  SHIPPING_LIMITS,
  SHOP_LIMITS,
  VENDOR_PRODUCT_LIMITS,
} from "@kemdia/contracts/constants";
import type { DeliveryTariffsRequest } from "@kemdia/contracts";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SESSION_COOKIE, expiredCookieOptions } from "@/lib/auth/cookies";
import { forgetSession } from "@/lib/auth/session";
import type { StaffFailure } from "./api-staff";
import { staffErrorMessage, type StaffNotice } from "./messages";
import { qrDrawing, type QrDrawing } from "./qr";
import { staffPath } from "./roles";
import { sessionToken, staffApi } from "./staff";

/**
 * Actions serveur de l'espace de l'équipe (S6-T05, ADR-0036). Ce sont des points d'entrée PUBLICS : chaque argument
 * est revérifié ici (type, longueur, forme) et l'API refait toutes les règles (rôle, 2FA confirmée, statut, version
 * lue). Le jeton de session ne quitte jamais le serveur ; un secret ou des codes de secours ne sont renvoyés qu'au
 * navigateur qui vient de les demander, jamais mis dans une adresse ni dans un cookie.
 */

export type StaffActionFailure = { ok: false; message: string; signedOut?: boolean };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** Code à 6 chiffres, ou code de secours « abcd-efgh-jkmn » (l'API tolère majuscules et espaces). */
const CODE_INPUT = /^[A-Za-z0-9 -]{6,20}$/;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?Z$/;

const text = (value: unknown, max: number): string | null =>
  typeof value === "string" && value.length <= max ? value : null;
const field = (form: FormData, name: string, max: number) => text(form.get(name), max);

/** Session refusée, ou fermée par l'API après trop de codes faux : on oublie le cookie de ce navigateur. */
async function dropSession(token: string): Promise<void> {
  forgetSession(token);
  (await cookies()).set(SESSION_COOKIE, "", expiredCookieOptions());
}

async function failure(token: string, result: StaffFailure): Promise<StaffActionFailure> {
  const signedOut = result.code === "SESSION_INVALIDE" || result.code === "TROP_D_ESSAIS";
  if (signedOut) await dropSession(token);
  return {
    ok: false,
    message: staffErrorMessage(result.code, result.retryAfterSeconds),
    ...(signedOut ? { signedOut: true } : {}),
  };
}

const signedOutFailure: StaffActionFailure = {
  ok: false,
  message: staffErrorMessage("SESSION_INVALIDE"),
  signedOut: true,
};

// --- Double authentification (S6-T03) ---

export type SetupResult =
  { ok: true; secret: string; otpauthUri: string; qr: QrDrawing } | StaffActionFailure;

/** Nouveau secret contre le mot de passe : le QR code est dessiné ici, sur le serveur. */
export async function setupSecondFactorAction(password: unknown): Promise<SetupResult> {
  const token = await sessionToken();
  if (!token) return signedOutFailure;
  const pw = text(password, 200);
  if (!pw) return { ok: false, message: staffErrorMessage("MOT_DE_PASSE_INCORRECT") };
  const result = await staffApi().setupSecondFactor(token, pw);
  if (!result.ok) return failure(token, result);
  const { secret, otpauthUri } = result.data;
  return { ok: true, secret, otpauthUri, qr: qrDrawing(otpauthUri) };
}

export type CodesResult = { ok: true; recoveryCodes: string[] } | StaffActionFailure;

/** Premier code : active la 2FA ; les 10 codes de secours ne sont montrés qu'ici, une fois. */
export async function enableSecondFactorAction(code: unknown): Promise<CodesResult> {
  const token = await sessionToken();
  if (!token) return signedOutFailure;
  const value = text(code, 20)?.trim();
  if (!value || !OTP_CODE_PATTERN.test(value))
    return { ok: false, message: "Saisissez le code à 6 chiffres affiché dans votre application." };
  const result = await staffApi().enableSecondFactor(token, value);
  if (!result.ok) return failure(token, result);
  return { ok: true, recoveryCodes: [...result.data.recoveryCodes] };
}

/** Confirme cette session pour 15 minutes, puis revient à la page de l'équipe demandée. */
export async function verifySecondFactorAction(
  code: unknown,
  returnTo: unknown,
): Promise<StaffActionFailure> {
  const token = await sessionToken();
  if (!token) return signedOutFailure;
  const value = text(code, 30)?.trim();
  if (!value || !CODE_INPUT.test(value))
    return {
      ok: false,
      message: "Saisissez le code à 6 chiffres de votre application, ou un code de secours.",
    };
  const result = await staffApi().verifySecondFactor(token, value);
  if (!result.ok) return failure(token, result);
  // Hors du bloc ci-dessus : `redirect` interrompt l'action (jamais attrapé)
  redirect(staffPath(returnTo));
}

/** Nouveaux codes de secours, contre un code FRAIS de l'application (pas un code de secours). */
export async function regenerateRecoveryCodesAction(code: unknown): Promise<CodesResult> {
  const token = await sessionToken();
  if (!token) return signedOutFailure;
  const value = text(code, 20)?.trim();
  if (!value || !OTP_CODE_PATTERN.test(value))
    return { ok: false, message: "Saisissez le code à 6 chiffres affiché dans votre application." };
  const result = await staffApi().regenerateRecoveryCodes(token, value);
  if (!result.ok) return failure(token, result);
  return { ok: true, recoveryCodes: [...result.data.recoveryCodes] };
}

// --- Décisions (formulaires simples : fonctionnent même sans JavaScript) ---

/**
 * Après une décision refusée par l'API : 2FA à confirmer → saisie du code puis retour ; session perdue → connexion ;
 * sinon, la page de départ avec le code d'erreur (liste fermée, relue par la page).
 */
async function afterFailure(token: string, result: StaffFailure, page: string): Promise<never> {
  if (result.code === "DEUX_FACTEURS_REQUIS")
    redirect(`/equipe/confirmer?retour=${encodeURIComponent(page)}`);
  if (result.code === "DEUX_FACTEURS_A_ACTIVER") redirect("/equipe/securite");
  if (result.code === "SESSION_INVALIDE") {
    await dropSession(token);
    redirect(`/connexion?retour=${encodeURIComponent(page)}`);
  }
  redirect(`${page}?erreur=${result.code}`);
}

const SHOP_DECISIONS = ["approve", "reject", "suspend"] as const;
const SHOP_NOTICES: Record<(typeof SHOP_DECISIONS)[number], StaffNotice> = {
  approve: "boutique-validee",
  reject: "boutique-refusee",
  suspend: "boutique-suspendue",
};

/** Valider, refuser ou suspendre une boutique (administrateurs). */
export async function decideShopAction(form: FormData): Promise<never> {
  const shopId = field(form, "shopId", 36);
  const decision = SHOP_DECISIONS.find((d) => d === form.get("decision"));
  if (!shopId || !UUID.test(shopId) || !decision) redirect("/equipe/boutiques");
  const page = `/equipe/boutiques/${shopId.toLowerCase()}`;
  const token = await sessionToken();
  if (!token) redirect(`/connexion?retour=${encodeURIComponent(page)}`);
  let reason: string | undefined;
  if (decision !== "approve") {
    reason = field(form, "reason", SHOP_LIMITS.reasonMax * 2)?.trim();
    if (!reason || reason.length < SHOP_LIMITS.reasonMin || reason.length > SHOP_LIMITS.reasonMax)
      redirect(`${page}?erreur=BOUTIQUE_INVALIDE`);
  }
  const result = await staffApi().decideShop(token, shopId, decision, reason);
  if (!result.ok) return afterFailure(token, result, page);
  redirect(`${page}?ok=${SHOP_NOTICES[decision]}`);
}

const PRODUCT_DECISIONS = ["approve", "reject"] as const;

/** Valider ou refuser la version d'un produit LUE par le modérateur (`submittedAt`). */
export async function decideProductAction(form: FormData): Promise<never> {
  const productId = field(form, "productId", 36);
  const decision = PRODUCT_DECISIONS.find((d) => d === form.get("decision"));
  const submittedAt = field(form, "submittedAt", 40);
  if (
    !productId ||
    !UUID.test(productId) ||
    !decision ||
    !submittedAt ||
    !ISO_DATE.test(submittedAt)
  )
    redirect("/equipe/moderation");
  const page = `/equipe/moderation/${productId.toLowerCase()}`;
  const token = await sessionToken();
  if (!token) redirect(`/connexion?retour=${encodeURIComponent(page)}`);
  let reason: string | undefined;
  if (decision === "reject") {
    reason = field(form, "reason", VENDOR_PRODUCT_LIMITS.reasonMax * 2)?.trim();
    const L = VENDOR_PRODUCT_LIMITS;
    if (!reason || reason.length < L.reasonMin || reason.length > L.reasonMax)
      redirect(`${page}?erreur=PRODUIT_INVALIDE`);
  }
  const result = await staffApi().decideProduct(token, productId, decision, submittedAt, reason);
  if (!result.ok) return afterFailure(token, result, page);
  // Retour à la file : le produit suivant attend
  redirect(`/equipe/moderation?ok=${decision === "approve" ? "produit-valide" : "produit-refuse"}`);
}

const KYC_DECISIONS = ["approve", "reject"] as const;

/** Valider ou refuser le dossier de vérification d'un vendeur (administrateurs, S6-T08). */
export async function decideKycAction(form: FormData): Promise<never> {
  const shopId = field(form, "shopId", 36);
  const decision = KYC_DECISIONS.find((d) => d === form.get("decision"));
  if (!shopId || !UUID.test(shopId) || !decision) redirect("/equipe/verifications");
  const page = `/equipe/verifications/${shopId.toLowerCase()}`;
  const token = await sessionToken();
  if (!token) redirect(`/connexion?retour=${encodeURIComponent(page)}`);
  let reason: string | undefined;
  if (decision === "reject") {
    reason = field(form, "reason", SHOP_LIMITS.reasonMax * 2)?.trim();
    const length = reason ? [...reason].length : 0;
    if (!reason || length < SHOP_LIMITS.reasonMin || length > SHOP_LIMITS.reasonMax)
      redirect(`${page}?erreur=KYC_INVALIDE`);
  }
  const result = await staffApi().decideKyc(token, shopId, decision, reason);
  if (!result.ok) return afterFailure(token, result, page);
  redirect(`${page}?ok=${decision === "approve" ? "kyc-valide" : "kyc-refuse"}`);
}

// --- Livraisons (S7-T02, administrateurs) ---

const ORDER_REFERENCE = /^KMD-[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{6}$/;
const SHIPMENT_STEPS = ["hand-over", "delivered", "failed", "retry", "cancel"] as const;
const STEP_NOTICES: Record<(typeof SHIPMENT_STEPS)[number], StaffNotice> = {
  "hand-over": "livraison-remise",
  delivered: "livraison-livree",
  failed: "livraison-echec",
  retry: "livraison-relancee",
  cancel: "livraison-annulee",
};

/**
 * Étape d'une livraison. La remise au transporteur part de la liste « Prêtes » (on y revient) ; les autres étapes, de
 * la fiche de l'expédition. Motif (échec) et note (annulation) : 3 à 200 caractères, revérifiés par l'API.
 */
export async function shipmentStepAction(form: FormData): Promise<never> {
  const reference = field(form, "reference", 10);
  const step = SHIPMENT_STEPS.find((s) => s === form.get("step"));
  if (!reference || !ORDER_REFERENCE.test(reference) || !step) redirect("/equipe/livraisons");
  const page = step === "hand-over" ? "/equipe/livraisons" : `/equipe/livraisons/${reference}`;
  const token = await sessionToken();
  if (!token) redirect(`/connexion?retour=${encodeURIComponent(page)}`);
  let text: string | undefined;
  if (step === "failed" || step === "cancel") {
    text = field(form, "reason", SHIPPING_LIMITS.reasonMax * 2)?.trim();
    const length = text ? [...text].length : 0;
    if (!text || length < SHIPPING_LIMITS.reasonMin || length > SHIPPING_LIMITS.reasonMax)
      redirect(`${page}?erreur=EXPEDITION_INVALIDE`);
  }
  const result = await staffApi().shipmentStep(token, reference, step, text);
  if (!result.ok) return afterFailure(token, result, page);
  // Après la remise, on reste sur la liste des commandes prêtes (plusieurs colis à la suite)
  redirect(`${page}?ok=${STEP_NOTICES[step]}`);
}

const ZONE_IDS = ["zone_1", "zone_2", "zone_3", "zone_4"] as const;

/** Nombre entier saisi dans le formulaire (espaces de milliers tolérés), dans les bornes ; sinon `null`. */
function integer(form: FormData, name: string, max: number): number | null {
  const raw = field(form, name, 20)?.replace(/[\s\u202f\u00a0]/g, "");
  if (!raw || !/^\d{1,9}$/.test(raw)) return null;
  const value = Number(raw);
  return value <= max ? value : null;
}

/** Barème des 4 zones (administrateurs) ; l'API revérifie tout et inscrit le changement au journal d'audit. */
export async function updateTariffsAction(form: FormData): Promise<never> {
  const page = "/equipe/livraisons/bareme";
  const token = await sessionToken();
  if (!token) redirect(`/connexion?retour=${encodeURIComponent(page)}`);
  const zones: DeliveryTariffsRequest["zones"] = [];
  for (const id of ZONE_IDS) {
    const baseFee = integer(form, `${id}.baseFee`, SHIPPING_LIMITS.baseFeeMax);
    const freeThreshold = integer(form, `${id}.freeThreshold`, SHIPPING_LIMITS.freeThresholdMax);
    const daysMin = integer(form, `${id}.daysMin`, SHIPPING_LIMITS.daysMax);
    const daysMax = integer(form, `${id}.daysMax`, SHIPPING_LIMITS.daysMax);
    if (
      baseFee === null ||
      freeThreshold === null ||
      daysMin === null ||
      daysMax === null ||
      daysMin > daysMax
    )
      redirect(`${page}?erreur=TARIFS_INVALIDES`);
    zones.push({ id, baseFee, freeThreshold, daysMin, daysMax });
  }
  const result = await staffApi().updateTariffs(token, { zones });
  if (!result.ok) return afterFailure(token, result, page);
  redirect(`${page}?ok=bareme-enregistre`);
}

// --- Fiches communes (S7.5-T03) ---

/** Page d'une fiche, après vérification de son identifiant ; le jeton de session ou la page de connexion. */
async function listingPage(form: FormData): Promise<{ token: string; id: string; page: string }> {
  const id = field(form, "listingId", 36);
  if (!id || !UUID.test(id)) redirect("/equipe/fiches");
  const page = `/equipe/fiches/${id.toLowerCase()}`;
  const token = await sessionToken();
  if (!token) redirect(`/connexion?retour=${encodeURIComponent(page)}`);
  return { token, id: id.toLowerCase(), page };
}

/**
 * Correction de la fiche : titre, description, marque, catégorie, noms des déclinaisons (et une nouvelle déclinaison).
 * Seuls les champs remplis partent ; l'API vérifie tout (mêmes règles que la fiche d'un vendeur).
 */
export async function updateListingAction(form: FormData): Promise<never> {
  const { token, id, page } = await listingPage(form);
  const L = VENDOR_PRODUCT_LIMITS;
  const title = field(form, "title", L.titleMax * 2)?.trim();
  const description = field(form, "description", L.descriptionMax * 2)?.trim();
  const brand = field(form, "brand", L.brandMax * 2)?.trim();
  const categoryId = field(form, "categoryId", 36);
  const variants: { id?: string; name: string }[] = [];
  for (const variantId of form.getAll("variantIds").slice(0, 50)) {
    if (typeof variantId !== "string" || !UUID.test(variantId)) continue;
    const name = field(form, `variant-${variantId}`, L.variantNameMax * 2)?.trim();
    const before = field(form, `variant-before-${variantId}`, L.variantNameMax * 2);
    if (name && name !== before) variants.push({ id: variantId.toLowerCase(), name });
  }
  const added = field(form, "newVariant", L.variantNameMax * 2)?.trim();
  if (added) variants.push({ name: added });
  if (categoryId && !UUID.test(categoryId)) redirect(`${page}?erreur=CATEGORIE_INCONNUE`);
  const result = await staffApi().updateListing(token, id, {
    ...(title ? { title } : {}),
    ...(description ? { description } : {}),
    // Marque vide : « sans marque »
    ...(brand !== undefined && form.has("brand") ? { brand: brand || null } : {}),
    ...(categoryId ? { categoryId } : {}),
    ...(variants.length ? { variants } : {}),
  });
  if (!result.ok) return afterFailure(token, result, page);
  redirect(`${page}?ok=fiche-corrigee`);
}

export async function removeListingImageAction(form: FormData): Promise<never> {
  const { token, id, page } = await listingPage(form);
  const imageId = field(form, "imageId", 36);
  if (!imageId || !UUID.test(imageId)) redirect(`${page}?erreur=PHOTO_INTROUVABLE`);
  const result = await staffApi().removeListingImage(token, id, imageId);
  if (!result.ok) return afterFailure(token, result, page);
  redirect(`${page}?ok=photo-fiche-retiree`);
}

/**
 * Fusion d'un doublon dans une fiche en ligne : en deux temps (la fiche cible est choisie, puis chaque déclinaison
 * vendue du doublon reçoit sa déclinaison cible). Retour à la fiche CIBLE.
 */
export async function mergeListingAction(form: FormData): Promise<never> {
  const { token, id, page } = await listingPage(form);
  const into = field(form, "into", 36);
  if (!into || !UUID.test(into)) redirect(`${page}?erreur=FICHE_INTROUVABLE`);
  const variants: Record<string, string> = {};
  for (const from of form.getAll("sourceVariantIds").slice(0, 50)) {
    if (typeof from !== "string" || !UUID.test(from)) continue;
    const to = field(form, `map-${from}`, 36);
    if (to && UUID.test(to)) variants[from.toLowerCase()] = to.toLowerCase();
  }
  const result = await staffApi().mergeListing(token, id, into, variants);
  if (!result.ok) {
    if (
      ["DEUX_FACTEURS_REQUIS", "DEUX_FACTEURS_A_ACTIVER", "SESSION_INVALIDE"].includes(result.code)
    )
      return afterFailure(token, result, page);
    redirect(`${page}?fusion=${into.toLowerCase()}&erreur=${result.code}`);
  }
  redirect(`/equipe/fiches/${into.toLowerCase()}?ok=fiche-fusionnee`);
}

export async function withdrawOfferAction(form: FormData): Promise<never> {
  const { token, page } = await listingPage(form);
  const productId = field(form, "productId", 36);
  const reason = field(form, "reason", VENDOR_PRODUCT_LIMITS.reasonMax * 2)?.trim();
  const L = VENDOR_PRODUCT_LIMITS;
  if (!productId || !UUID.test(productId)) redirect(`${page}?erreur=PRODUIT_INTROUVABLE`);
  if (!reason || reason.length < L.reasonMin || reason.length > L.reasonMax)
    redirect(`${page}?erreur=PRODUIT_INVALIDE`);
  const result = await staffApi().withdrawOffer(token, productId, reason);
  if (!result.ok) return afterFailure(token, result, page);
  redirect(`${page}?ok=offre-retiree`);
}

/** Clôture d'une proposition de correction ; retour à la page d'où elle a été close (fiche ou liste). */
export async function closeCorrectionAction(form: FormData): Promise<never> {
  const correctionId = field(form, "correctionId", 36);
  const back = field(form, "back", 80);
  const page =
    back && /^\/equipe\/fiches(?:\/[0-9a-f-]{36})?$/.test(back) ? back : "/equipe/fiches";
  if (!correctionId || !UUID.test(correctionId)) redirect(page);
  const token = await sessionToken();
  if (!token) redirect(`/connexion?retour=${encodeURIComponent(page)}`);
  const note = field(form, "note", 600)?.trim() || undefined;
  if (note && [...note].length > 300) redirect(`${page}?erreur=PRODUIT_INVALIDE`);
  const result = await staffApi().closeCorrection(token, correctionId, note);
  if (!result.ok) return afterFailure(token, result, page);
  redirect(`${page}?ok=correction-close`);
}
